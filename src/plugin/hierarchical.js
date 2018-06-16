'use strict';

import * as Chart from 'chart.js';
import {toNodes, countExpanded, lastOfLevel, resolve, parentsOf} from '../utils';

const HierarchicalPlugin = {
  id: 'chartJsPluginHierarchical',

  /**
   * checks whether this plugin needs ot be enabled based on wehther one is a hierarchical axis
   */
  _enabled(chart) {
    if (chart.config.options.scales.xAxes[0].type === 'hierarchical') {
      return 'x';
    }
    if (chart.config.options.scales.yAxes[0].type === 'hierarchical') {
      return 'y';
    }
    return null;
  },

  beforeInit(chart) {
    if (!this._enabled(chart)) {
      return;
    }
    // convert labels to nodes
    const flat = chart.data.flatLabels = toNodes(chart.data.labels);
    // the real labels are the one not hidden in the tree
    const labels = chart.data.labels = chart.data.flatLabels.filter((d) => !d.hidden);

    // convert the data tree to the flat visible counterpart
    chart.data.datasets.forEach((dataset) => {
      if (dataset.tree == null) {
        dataset.tree = dataset.data.slice();
      }
      dataset.data = labels.map((l) => resolve(l, flat, dataset.tree));
    });
  },

  afterInit(chart) {
    if (!this._enabled(chart)) {
      return;
    }
    this._updateAttributes(chart);
  },

  /**
   * updates the attributes according to config, similar to data sync
   */
  _updateAttributes(chart) {
    const scale = this._findScale(chart);
    if (!scale) {
      return;
    }
    const attributes = scale.options.attributes;

    const nodes = chart.data.labels;
    const flat = chart.data.flatLabels;

    Object.keys(attributes).forEach((attr) => {
      chart.data.datasets.forEach((d) => {
        d[attr] = nodes.map((n) => {
          while (n) {
            if (n.hasOwnProperty(attr)) {
              return n[attr];
            }
            // walk up the hierarchy
            n = n.parent >= 0 ? flat[n.parent] : null;
          }
          return attributes[attr]; // default value
        });
      });
    });
  },

  _findScale(chart) {
    const scales = Object.keys(chart.scales).map((d) => chart.scales[d]);
    return scales.find((d) => d.type === 'hierarchical');
  },

  /**
   * draw the hierarchy indicators
   */
  beforeDatasetsDraw(chart) {
    if (!this._enabled(chart)) {
      return;
    }
    const scale = this._findScale(chart);
    const flat = chart.data.flatLabels;
    const ctx = chart.ctx;
    const hor = scale.isHorizontal();

    const boxSize = scale.options.hierarchyBoxSize;
    const boxSize5 = boxSize * 0.5;
    const boxSize1 = boxSize * 0.1;
    const boxRow = scale.options.hierarchyBoxLineHeight;
    const boxColor = scale.options.hierarchyBoxColor;
    const boxWidth = scale.options.hierarchyBoxWidth;
    const boxSpanColor = scale.options.hierarchySpanColor;
    const boxSpanWidth = scale.options.hierarchySpanWidth;

    ctx.save();
    ctx.strokeStyle = boxColor;
    ctx.lineeWidth = boxWidth;

    if (hor) {
      ctx.translate(scale.left, scale.top + scale.options.padding);

      chart.data.labels.forEach((tick) => {
        const center = tick.center;
        let offset = 0;
        const parents = parentsOf(tick, flat);

        parents.slice(1).forEach((d) => {
          if (d.relIndex === 0) {
            const last = lastOfLevel(d, flat);
            ctx.strokeRect(center - boxSize5, offset + 0, boxSize, boxSize);
            ctx.strokeRect(center - 3, offset + 4, 6, 2);

            // render helper indicator line
            ctx.strokeStyle = boxSpanColor;
            ctx.lineWidth = boxSpanWidth;
            ctx.beginPath();
            ctx.moveTo(center + boxSize5, offset + boxSize5);
            ctx.lineTo(last.center, offset + boxSize5);
            ctx.lineTo(last.center, offset + boxSize1);
            ctx.stroke();
            ctx.strokeStyle = boxColor;
            ctx.lineWidth = boxWidth;
          }
          offset += boxRow;
        });

        if (tick.children.length > 0) {
          ctx.strokeRect(center - boxSize5, offset + 0, boxSize, boxSize);
          ctx.strokeRect(center - 3, offset + 4, 6, 2);
          ctx.strokeRect(center - 1, offset + 2, 2, 6);
        }
      });
    } else {
      ctx.translate(scale.left - scale.options.padding, scale.top);

      chart.data.labels.forEach((tick) => {
        const center = tick.center;
        let offset = 0;
        const parents = parentsOf(tick, flat);

        parents.slice(1).forEach((d) => {
          if (d.relIndex === 0) {
            const last = lastOfLevel(d, flat);
            ctx.strokeRect(offset - boxSize, center - boxSize5, boxSize, boxSize);
            ctx.fillRect(offset - 8, center - 1, 6, 2);

            // render helper indicator line
            ctx.strokeStyle = boxSpanColor;
            ctx.lineWidth = boxSpanWidth;
            ctx.beginPath();
            ctx.moveTo(offset - boxSize5, center + boxSize5);
            ctx.lineTo(offset - boxSize5, last.center);
            ctx.lineTo(offset - boxSize1, last.center);
            ctx.stroke();
            ctx.strokeStyle = boxColor;
            ctx.lineWidth = boxWidth;
          }
          offset -= boxRow;
        });

        // render expand hint
        if (tick.children.length > 0) {
          ctx.strokeRect(offset - boxSize, center - boxSize5, boxSize, boxSize);
          ctx.strokeRect(offset - 8, center - 1, 6, 2);
          ctx.strokeRect(offset - 6, center - 3, 2, 6);
        }
      });
    }

    ctx.restore();
  },

  _splice(chart, index, count, toAdd) {
    const labels = chart.data.labels;
    const flatLabels = chart.data.flatLabels;
    const data = chart.data.datasets;

    const removed = labels.splice.apply(labels, [index, count].concat(toAdd));
    removed.forEach((d) => {
      d.hidden = true;
      d.collapsed = true;
    });
    toAdd.forEach((d) => {
      d.hidden = false;
    });

    data.forEach((dataset) => {
      const toAddData = toAdd.map((d) => resolve(d, flatLabels, dataset.tree));
      dataset.data.splice.apply(dataset.data, [index, count].concat(toAddData));
    });

    this._updateAttributes(chart);

    chart.update();
  },

  _resolveElement(event, chart, scale) {
    const hor = scale.isHorizontal();
    let offset = hor ? scale.top + scale.options.padding : scale.left - scale.options.padding;
    if ((hor && event.y <= offset) || (!hor && event.x > offset)) {
      return null;
    }

    const elem = chart.getElementsAtEventForMode(event, 'index', {axis: hor ? 'x' : 'y'})[0];
    if (!elem) {
      return null;
    }
    return {offset, index: elem._index};
  },

  beforeEvent(chart, event) {
    if (event.type !== 'click' || !this._enabled(chart)) {
      return;
    }

    const scale = this._findScale(chart);
    const hor = scale.isHorizontal();

    const elem = this._resolveElement(event, chart, scale);
    if (!elem) {
      return;
    }
    let offset = elem.offset;

    const index = elem.index;
    const flat = chart.data.flatLabels;
    const label = chart.data.labels[index];
    const parents = parentsOf(label, flat);
    const boxRow = scale.options.hierarchyBoxLineHeight;

    const inRange = hor ? (o) => event.y >= o && event.y <= o + boxRow : (o) => event.x <= o && event.x >= o - boxRow;

    for (let i = 1; i < parents.length; ++i) {
      const parent = parents[i];
      // out of box
      if (parent.relIndex === 0 || inRange(offset)) {
        // collapse its parent?
        const pp = flat[parent.parent];
        const count = countExpanded(pp);
        pp.collapse = true;
        this._splice(chart, index, count, [pp]);
        return;
      }
      offset += hor ? boxRow : -boxRow;
    }

    if (label.children.length > 0 && inRange(offset)) {
      // expand
      label.collapse = false;
      this._splice(chart, index, 1, label.children);
      return;
    }
  }
};

Chart.pluginService.register(HierarchicalPlugin);

export default HierarchicalPlugin;
