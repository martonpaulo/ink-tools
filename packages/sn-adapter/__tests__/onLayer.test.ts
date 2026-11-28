/** A file API write names its target layer in each element's `layerNum`, as it takes no layer argument (#334). */
import {onLayer} from '../src/official';

describe('onLayer', () => {
  it('sets layerNum on every element when a layer is given', () => {
    expect(onLayer([{type: 0}, {type: 500, layerNum: 0}], 2)).toEqual([
      {type: 0, layerNum: 2},
      {type: 500, layerNum: 2},
    ]);
  });

  it('leaves the elements as they are without a layer', () => {
    const elements = [{type: 0, layerNum: 1}];
    expect(onLayer(elements)).toBe(elements);
    expect(elements).toEqual([{type: 0, layerNum: 1}]);
  });
});
