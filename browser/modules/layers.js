/**
 * @fileoverview Description of file, its uses and information
 * about its dependencies.
 */

'use strict';

/**
 *
 * @type {*|exports|module.exports}
 */
var urlparser = require('./urlparser');

/**
 * @type {string}
 */
var db = urlparser.db;


/**
 * @type {Object}
 */
var cloud;

/**
 *
 * @type {boolean}
 */
var ready = false;

/**
 *
 * @type {string}
 */
var BACKEND = require('../../config/config.js').backend;


/**
 *
 */
var meta;

/**
 *
 */
var backboneEvents;

var host = require("./connection").getHost();

var layerTree;

var array = [];

var uri = null

/**
 *
 * @type {{set: module.exports.set, init: module.exports.init, getMetaDataKeys: module.exports.getMetaDataKeys, ready: module.exports.ready}}
 */
module.exports = {
    /**
     *
     * @param o
     * @returns {exports}
     */
    set: function (o) {
        cloud = o.cloud;
        meta = o.meta;
        layerTree = o.layerTree;
        backboneEvents = o.backboneEvents;
        return this;
    },

    /**
     *
     */
    init: function () {

    },

    ready: function () {
        return ready;
    },

    getLayers: function (separator, includeHidden) {
        var layerArr = [];
        var layers = cloud.get().map._layers;

        for (var key in layers) {
            if (layers[key].baseLayer !== true) {
                if (typeof layers[key].id === "undefined" || (typeof layers[key].id !== "undefined" && (layers[key].id.split(".")[0] !== "__hidden") || includeHidden === true)) {
                    if (typeof layers[key]._tiles === "object" || layers[key].id && layers[key].id.startsWith('v:')) {
                        layerArr.push(layers[key].id);
                    }
                }
            }
        }

        if (layerArr.length > 0) {
            return layerArr.join(separator ? separator : ",");
        } else {
            return false;
        }
    },

    removeHidden: function () {
        var layers = cloud.get().map._layers;
        for (var key in layers) {
            if (layers.hasOwnProperty(key)) {
                if (typeof layers[key].id !== "undefined" && layers[key].id.split(".")[0] === "__hidden") {
                    cloud.get().map.removeLayer(layers[key]);
                }
            }
        }
    },

    resetCount: function () {
        ready = false;
    },

    incrementCountLoading: function (i) {
        if (array.indexOf(i) === -1) {
            array.push(i)
        }
        return array.length;
    },

    decrementCountLoading: function (i) {
        array.splice(array.indexOf(i), 1);
        return array.length;
    },

    getCountLoading: function () {
        return array.length;
    },

    getArray: function () {
        return array;
    },

    setUri: function (str) {
      uri = str;
    },

    /**
     *
     * @param l
     * @returns {Promise}
     */
    addLayer: function (l) {
        var me = this;

        return new Promise(function (resolve, reject) {
            layerTree.getLayersOrder().then(order => {
                var isBaseLayer, layers = [], metaData = meta.getMetaData();

                $.each(metaData.data, function (i, v) {
                    var layer = v.f_table_schema + "." + v.f_table_name,
                        singleTiled = (JSON.parse(v.meta) !== null && JSON.parse(v.meta).single_tile !== undefined && JSON.parse(v.meta).single_tile === true);

                    if (layer === l) {
                        isBaseLayer = !!v.baselayer;
                        layers[[layer]] = cloud.get().addTileLayers({
                            host: host,
                            layers: [layer],
                            db: db,
                            isBaseLayer: isBaseLayer,
                            tileCached: !singleTiled,
                            singleTile: singleTiled,
                            // @todo Was somehow set to false
                            //visibility: false,
                            wrapDateLine: false,
                            displayInLayerSwitcher: true,
                            name: v.f_table_name,
                            // Single tile option
                            type: !singleTiled ? "tms" : "wms",
                            format: "image/png",
                            uri: uri,
                            loadEvent: function () {
                                me.decrementCountLoading(layer);
                                backboneEvents.get().trigger("doneLoading:layers", layer);
                            },
                            loadingEvent: function () {
                                me.incrementCountLoading(layer);
                                backboneEvents.get().trigger("startLoading:layers", layer);
                            },
                            subdomains: window.gc2Options.subDomainsForTiles
                        });

                        let groupLayersOrder = false;
                        let groupIndex = 0;
                        order.map((orderItem, orderIndex) => {
                            if (orderItem.id === v.layergroup && orderItem.layers) {
                                groupLayersOrder = orderItem.layers;
                                groupIndex = orderIndex;
                                return false;
                            }
                        });

                        if (groupLayersOrder) {
                            // Client-enforced layers order is available, setting index according to it
                            groupLayersOrder.map((item, index) => {
                                if (item.id in layers) {
                                    layers[[item.id]][0].setZIndex(index + (groupIndex + 1) * 10000);
                                    console.log('##', item.id, index + (groupIndex + 1) * 10000);
                                }
                            });
                        } else {
                            layers[[layer]][0].setZIndex(v.sort_id + 10000);
                        }

                        console.info(`${l} was added to the map`);
                        resolve();
                    }
                });

                console.info(`${l} was not added to the map`);
                reject();
            });
        });
    }
};