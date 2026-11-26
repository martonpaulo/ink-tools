/** Smart Pen's pen-up router (#305): Smart Shapes decides first, and a replaced stroke is never converted. */
import {ok} from '@ink-tools/sn-adapter/official';
import {createPenRouter, type ShapesPenUp} from '../src/pen';
import {applyModules} from '../src/modules';
import type {Outcome} from '../src/modules/shapes/snap';

const setup = () => {
  let listener: ((elements: object[]) => void) | null = null;
  const stop = jest.fn(() => {
    listener = null;
  });
  const device = {
    onPenUp: jest.fn((next: (elements: object[]) => void) => {
      listener = next;
      return ok(stop);
    }),
    recycleElement: jest.fn(async () => ok(true)),
    log: jest.fn(),
  };
  const router = createPenRouter(device);
  const fire = async (elements: object[]) => {
    listener?.(elements);
    // Let the routing promise chain settle.
    await new Promise(resolve => setImmediate(resolve));
  };
  return {router, device, stop, fire};
};

const shapes = (outcome: Outcome) => {
  const kept: boolean[] = [];
  const penUp: ShapesPenUp = async (_elements, keep) => {
    kept.push(keep(outcome));
    return outcome;
  };
  return {penUp: jest.fn(penUp), kept};
};

test('with no module listening there is no device listener', () => {
  const {router, device} = setup();
  expect(router.listening).toBe(false);
  expect(device.onPenUp).not.toHaveBeenCalled();
});

test('at start-up Smart Shapes listens with the Real-Time Text mode off (#449)', async () => {
  const {router, device, fire} = setup();
  const shape = shapes('no hold');
  // As index.js: starting Real-Time Text registers its buttons only; its pen-up listener waits for
  // the mode button, while Smart Shapes takes the router's listener as it starts.
  const host = {
    startText: async () => {},
    stopText: async () => {},
    startShapes: () => {
      router.setShapes(shape.penUp);
    },
    stopShapes: () => {
      router.setShapes(null);
    },
  };
  await applyModules(host, null, {text: true, shapes: true});
  expect(device.onPenUp).toHaveBeenCalledTimes(1);
  expect(router.listening).toBe(true);
  await fire([{uuid: 'a'}]);
  expect(shape.penUp).toHaveBeenCalledTimes(1);
});

test('a stroke Smart Shapes replaced never reaches Real-Time Text', async () => {
  const {router, fire} = setup();
  const shape = shapes('circle (lasso)');
  router.setShapes(shape.penUp);
  const text = jest.fn();
  router.onTextPenUp(text);
  await fire([{uuid: 'a'}]);
  expect(shape.penUp).toHaveBeenCalledTimes(1);
  expect(text).not.toHaveBeenCalled();
  // Smart Shapes frees the stroke it replaced.
  expect(shape.kept).toEqual([false]);
});

test('a stroke Smart Shapes kept goes on to Real-Time Text, which frees it', async () => {
  const {router, fire} = setup();
  const shape = shapes('no hold');
  router.setShapes(shape.penUp);
  const text = jest.fn();
  router.onTextPenUp(text);
  await fire([{uuid: 'a'}]);
  expect(text).toHaveBeenCalledWith([{uuid: 'a'}]);
  expect(shape.kept).toEqual([true]);
});

test('Smart Shapes alone frees every stroke, and Real-Time Text alone gets every stroke', async () => {
  const alone = setup();
  const shape = shapes('no shape');
  alone.router.setShapes(shape.penUp);
  await alone.fire([{uuid: 'a'}]);
  expect(shape.kept).toEqual([false]);

  const textOnly = setup();
  const text = jest.fn();
  textOnly.router.onTextPenUp(text);
  await textOnly.fire([{uuid: 'b'}]);
  expect(text).toHaveBeenCalledWith([{uuid: 'b'}]);
});

test('the device listener goes once no module listens', () => {
  const {router, device, stop} = setup();
  router.setShapes(shapes('no hold').penUp);
  const stopText = router.onTextPenUp(jest.fn());
  expect(device.onPenUp).toHaveBeenCalledTimes(1);
  router.setShapes(null);
  expect(router.listening).toBe(true);
  if (stopText.ok) {
    stopText.value();
  }
  expect(stop).toHaveBeenCalledTimes(1);
  expect(router.listening).toBe(false);
});

test('a Smart Shapes failure still lets Real-Time Text read the stroke', async () => {
  const {router, device, fire} = setup();
  router.setShapes(async () => {
    throw new Error('boom');
  });
  const text = jest.fn();
  router.onTextPenUp(text);
  await fire([{uuid: 'a'}]);
  expect(text).toHaveBeenCalledWith([{uuid: 'a'}]);
  expect(device.log).toHaveBeenCalledWith(expect.stringContaining('boom'));
});
