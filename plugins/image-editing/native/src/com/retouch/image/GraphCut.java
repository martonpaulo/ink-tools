package com.retouch.image;

import com.inktools.files.EinkPixels;
import java.util.Arrays;

/**
 * Background removal on a textured ground (#134): a GrabCut-style cut of the subject from a busy
 * photo, plain Java. The frame's edge is ground; the rest starts as subject. Each round learns a
 * gray-and-local-mean histogram of the subject and of the ground, then finds the labelling of
 * least cost with one minimum cut: a pixel pays for the label its histogram finds unlikely, a pair
 * of neighbours pays for a cut between them unless their grays differ, and the centre leans to
 * subject. A dark apple on dark leaves differs from them in texture and shape, not in tone, which
 * the tone flood of {@link Retouch#groundMask} cannot use (beta 16 device round).
 *
 * <p>shortcut: gray only, one subject near the centre; a colour photo whose subject differs only
 * in hue, or a subject off the centre, loses part of it. Upgrade to a segmenter (the MediaPipe
 * trial of #134) when that shows on the device.
 */
final class GraphCut {
  /** The picture is cut at most this many pixels; a larger one is cut scaled down, then upscaled. */
  static final int MAX_PIXELS = 40000;
  /**
   * A smaller picture is never cut: its every pixel is near an edge, so its hull fills the frame
   * whether or not its ground is textured.
   */
  static final int MIN_SIDE = 32;
  /** The frame's edge band always ground, as a share of each side. */
  static final double EDGE_SHARE = 0.06;
  /** Rounds of learning the two histograms and cutting again. */
  static final int ROUNDS = 2;
  /** Histogram bins of the gray and of the local mean each. */
  static final int BINS = 16;
  /** The local mean's square radius in pixels: it tells a smooth surface from a busy one. */
  static final int MEAN_RADIUS = 2;
  /** Costs are in tenths of a natural log unit of likelihood, so they fit an int. */
  static final double COST_SCALE = 10;
  /** The cost of cutting between two neighbours of equal gray, in log units. */
  static final double SMOOTHNESS = 105;
  /** The centre's pull towards the subject, in log units, at the very centre. */
  static final double CENTRE_PULL = 3;
  /** Inside this squared share of the half-size from the centre, nothing pulls towards ground. */
  static final double CENTRE_CORE = 0.3;
  /** A cost that no cut pays: the frame's edge is ground. */
  private static final int HARD = 1 << 28;


  private GraphCut() {}

  /** The subject of an opaque picture, true where it is, at the picture's own size. */
  static boolean[] subject(Retouch.Picture seen) {
    int w = seen.width;
    int h = seen.height;
    double shrink = Math.min(1, Math.sqrt((double) MAX_PIXELS / ((long) w * h)));
    int sw = Math.max(1, (int) Math.round(w * shrink));
    int sh = Math.max(1, (int) Math.round(h * shrink));
    int[] gray = new int[sw * sh];
    for (int y = 0; y < sh; y++) {
      for (int x = 0; x < sw; x++) {
        gray[y * sw + x] = EinkPixels.luminance(seen.argb[(y * h / sh) * w + x * w / sw]);
      }
    }
    boolean[] small = cut(gray, sw, sh);
    if (sw == w && sh == h) {
      return small;
    }
    boolean[] out = new boolean[w * h];
    for (int y = 0; y < h; y++) {
      for (int x = 0; x < w; x++) {
        out[y * w + x] = small[(y * sh / h) * sw + x * sw / w];
      }
    }
    return out;
  }

  /** The subject of a gray picture, by {@link #ROUNDS} rounds of learning and cutting. */
  static boolean[] cut(int[] gray, int w, int h) {
    int n = w * h;
    int[] mean = boxMean(gray, w, h, MEAN_RADIUS);
    int[] feature = new int[n];
    for (int i = 0; i < n; i++) {
      feature[i] = (gray[i] * BINS / (Retouch.MAX + 1)) * BINS + mean[i] * BINS / (Retouch.MAX + 1);
    }
    int ex = Math.max(1, (int) (w * EDGE_SHARE));
    int ey = Math.max(1, (int) (h * EDGE_SHARE));
    boolean[] edge = new boolean[n];
    boolean[] subject = new boolean[n];
    for (int y = 0; y < h; y++) {
      for (int x = 0; x < w; x++) {
        edge[y * w + x] = x < ex || x >= w - ex || y < ey || y >= h - ey;
        subject[y * w + x] = !edge[y * w + x];
      }
    }
    // A pair's cut cost falls with its gray step, scaled by the picture's mean squared step.
    double sum = 0;
    int pairs = 0;
    for (int i = 0; i < n; i++) {
      if (i % w + 1 < w) {
        sum += square(gray[i] - gray[i + 1]);
        pairs++;
      }
      if (i + w < n) {
        sum += square(gray[i] - gray[i + w]);
        pairs++;
      }
    }
    double beta = sum == 0 ? 0 : pairs / (2 * sum);
    int[] right = new int[n];
    int[] down = new int[n];
    for (int i = 0; i < n; i++) {
      if (i % w + 1 < w) {
        right[i] = pairCost(beta, gray[i] - gray[i + 1]);
      }
      if (i + w < n) {
        down[i] = pairCost(beta, gray[i] - gray[i + w]);
      }
    }
    int[] toSubject = new int[n];
    int[] toGround = new int[n];
    for (int round = 0; round < ROUNDS; round++) {
      double[] pSubject = histogram(feature, subject, true);
      double[] pGround = histogram(feature, subject, false);
      for (int i = 0; i < n; i++) {
        if (edge[i]) {
          toSubject[i] = 0;
          toGround[i] = HARD;
          continue;
        }
        double dx = (i % w - w / 2.0) / (w / 2.0);
        double dy = (i / w - h / 2.0) / (h / 2.0);
        double r2 = dx * dx + dy * dy;
        // The cost of calling it ground goes to the source, of calling it subject to the sink.
        toSubject[i] = (int) Math.round(COST_SCALE
            * (-Math.log(pGround[feature[i]]) + CENTRE_PULL * Math.max(0, 1 - r2)));
        toGround[i] = (int) Math.round(COST_SCALE
            * (-Math.log(pSubject[feature[i]]) + CENTRE_PULL * Math.max(0, r2 - CENTRE_CORE)));
      }
      subject = minCut(w, h, toSubject, toGround, right, down);
    }
    return subject;
  }

  private static double square(int v) {
    return (double) v * v;
  }

  private static int pairCost(double beta, int step) {
    return (int) Math.round(COST_SCALE * SMOOTHNESS * Math.exp(-beta * square(step)));
  }

  /** The share of each feature among the pixels whose label is `label`, with one added to each. */
  private static double[] histogram(int[] feature, boolean[] subject, boolean label) {
    double[] p = new double[BINS * BINS];
    double total = 0;
    for (int i = 0; i < feature.length; i++) {
      if (subject[i] == label) {
        p[feature[i]]++;
        total++;
      }
    }
    for (int k = 0; k < p.length; k++) {
      p[k] = (p[k] + 1) / (total + p.length);
    }
    return p;
  }

  /** Each pixel's mean over the square of radius `r` around it, cut at the frame. */
  private static int[] boxMean(int[] v, int w, int h, int r) {
    int[] out = new int[v.length];
    for (int y = 0; y < h; y++) {
      for (int x = 0; x < w; x++) {
        int s = 0;
        int k = 0;
        for (int yy = Math.max(0, y - r); yy <= Math.min(h - 1, y + r); yy++) {
          for (int xx = Math.max(0, x - r); xx <= Math.min(w - 1, x + r); xx++) {
            s += v[yy * w + xx];
            k++;
          }
        }
        out[y * w + x] = s / k;
      }
    }
    return out;
  }

  private static final int TERMINAL = -1;
  private static final int ORPHAN = -2;
  private static final int NONE = -3;
  private static final byte FREE = 0;
  private static final byte SOURCE = 1;
  private static final byte SINK = 2;

  /**
   * The source side of a minimum cut on the 4-connected `w` x `h` grid, by Boykov and Kolmogorov's
   * max-flow (two search trees that grow, augment and adopt their orphans; "An Experimental
   * Comparison of Min-Cut/Max-Flow Algorithms for Energy Minimization in Vision", 2004).
   * `fromSource[i]` and `toSink[i]` are pixel i's terminal capacities, `right[i]` and `down[i]`
   * the capacity each way between i and its neighbour.
   */
  static boolean[] minCut(int w, int h, int[] fromSource, int[] toSink, int[] right, int[] down) {
    int n = w * h;
    int[] head = new int[n];
    Arrays.fill(head, -1);
    int[] to = new int[4 * n];
    int[] next = new int[4 * n];
    int[] cap = new int[4 * n];
    int edges = 0;
    for (int i = 0; i < n; i++) {
      if (i % w + 1 < w) {
        edges = link(head, to, next, cap, edges, i, i + 1, right[i]);
      }
      if (i + w < n) {
        edges = link(head, to, next, cap, edges, i, i + w, down[i]);
      }
    }
    // A pixel's terminal residual: positive from the source, negative to the sink.
    long[] terminal = new long[n];
    byte[] tree = new byte[n];
    // The edge from a pixel to its parent in its tree, or TERMINAL, ORPHAN or NONE.
    int[] parent = new int[n];
    int[] stamp = new int[n];
    int[] depth = new int[n];
    int[] queue = new int[n + 1];
    boolean[] queued = new boolean[n];
    int qh = 0;
    int qt = 0;
    int[] orphans = new int[n];
    int orphanCount = 0;
    int time = 1;
    for (int i = 0; i < n; i++) {
      terminal[i] = (long) fromSource[i] - toSink[i];
      parent[i] = NONE;
      if (terminal[i] != 0) {
        tree[i] = terminal[i] > 0 ? SOURCE : SINK;
        parent[i] = TERMINAL;
        depth[i] = 1;
        stamp[i] = time;
        queue[qt] = i;
        qt = (qt + 1) % queue.length;
        queued[i] = true;
      }
    }
    while (qh != qt) {
      int p = queue[qh];
      qh = (qh + 1) % queue.length;
      queued[p] = false;
      if (tree[p] == FREE) {
        continue;
      }
      // Grow p's tree, until it meets the other tree by an edge from the source side.
      int bridge = -1;
      for (int k = head[p]; k >= 0; k = next[k]) {
        int q = to[k];
        if ((tree[p] == SOURCE ? cap[k] : cap[k ^ 1]) <= 0) {
          continue;
        }
        if (tree[q] == FREE) {
          tree[q] = tree[p];
          parent[q] = k ^ 1;
          stamp[q] = stamp[p];
          depth[q] = depth[p] + 1;
          if (!queued[q]) {
            queue[qt] = q;
            qt = (qt + 1) % queue.length;
            queued[q] = true;
          }
        } else if (tree[q] != tree[p]) {
          bridge = tree[p] == SOURCE ? k : k ^ 1;
          break;
        }
      }
      if (bridge < 0) {
        continue;
      }
      time++;
      // Augment along source ... a -bridge-> b ... sink by its bottleneck.
      int a = to[bridge ^ 1];
      int b = to[bridge];
      long flow = cap[bridge];
      for (int v = a; ; v = to[parent[v]]) {
        if (parent[v] == TERMINAL) {
          flow = Math.min(flow, terminal[v]);
          break;
        }
        flow = Math.min(flow, cap[parent[v] ^ 1]);
      }
      for (int v = b; ; v = to[parent[v]]) {
        if (parent[v] == TERMINAL) {
          flow = Math.min(flow, -terminal[v]);
          break;
        }
        flow = Math.min(flow, cap[parent[v]]);
      }
      int f = (int) flow;
      cap[bridge] -= f;
      cap[bridge ^ 1] += f;
      for (int v = a; ; ) {
        int e = parent[v];
        if (e == TERMINAL) {
          terminal[v] -= f;
          if (terminal[v] == 0) {
            parent[v] = ORPHAN;
            orphans[orphanCount++] = v;
          }
          break;
        }
        cap[e ^ 1] -= f;
        cap[e] += f;
        if (cap[e ^ 1] == 0) {
          parent[v] = ORPHAN;
          orphans[orphanCount++] = v;
        }
        v = to[e];
      }
      for (int v = b; ; ) {
        int e = parent[v];
        if (e == TERMINAL) {
          terminal[v] += f;
          if (terminal[v] == 0) {
            parent[v] = ORPHAN;
            orphans[orphanCount++] = v;
          }
          break;
        }
        cap[e] -= f;
        cap[e ^ 1] += f;
        if (cap[e] == 0) {
          parent[v] = ORPHAN;
          orphans[orphanCount++] = v;
        }
        v = to[e];
      }
      // Adopt each orphan into a neighbour still rooted at its terminal, or free it.
      while (orphanCount > 0) {
        int v = orphans[--orphanCount];
        byte side = tree[v];
        int best = NONE;
        int bestDepth = Integer.MAX_VALUE;
        for (int k = head[v]; k >= 0; k = next[k]) {
          int q = to[k];
          if (tree[q] != side || (side == SOURCE ? cap[k ^ 1] : cap[k]) <= 0) {
            continue;
          }
          int d = 0;
          int u = q;
          boolean rooted;
          while (true) {
            if (stamp[u] == time) {
              d += depth[u];
              rooted = true;
              break;
            }
            d++;
            if (parent[u] == TERMINAL) {
              stamp[u] = time;
              depth[u] = 1;
              rooted = true;
              break;
            }
            if (parent[u] < 0) {
              rooted = false;
              break;
            }
            u = to[parent[u]];
          }
          if (!rooted) {
            continue;
          }
          if (d < bestDepth) {
            best = k;
            bestDepth = d;
          }
          for (u = q; stamp[u] != time; u = to[parent[u]]) {
            stamp[u] = time;
            depth[u] = d--;
          }
        }
        if (best != NONE) {
          parent[v] = best;
          stamp[v] = time;
          depth[v] = bestDepth + 1;
          continue;
        }
        for (int k = head[v]; k >= 0; k = next[k]) {
          int q = to[k];
          if (tree[q] != side) {
            continue;
          }
          if ((side == SOURCE ? cap[k ^ 1] : cap[k]) > 0 && !queued[q]) {
            queue[qt] = q;
            qt = (qt + 1) % queue.length;
            queued[q] = true;
          }
          if (parent[q] >= 0 && to[parent[q]] == v) {
            parent[q] = ORPHAN;
            orphans[orphanCount++] = q;
          }
        }
        tree[v] = FREE;
        parent[v] = NONE;
      }
      if (tree[p] != FREE && !queued[p]) {
        queue[qt] = p;
        qt = (qt + 1) % queue.length;
        queued[p] = true;
      }
    }
    boolean[] source = new boolean[n];
    for (int i = 0; i < n; i++) {
      source[i] = tree[i] == SOURCE;
    }
    return source;
  }

  private static int link(int[] head, int[] to, int[] next, int[] cap, int e, int u, int v, int c) {
    to[e] = v;
    cap[e] = c;
    next[e] = head[u];
    head[u] = e;
    to[e + 1] = u;
    cap[e + 1] = c;
    next[e + 1] = head[v];
    head[v] = e + 1;
    return e + 2;
  }
}
