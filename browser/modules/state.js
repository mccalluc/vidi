/**
 * @fileoverview Description of file, its uses and information
 * about its dependencies.
 */

'use strict';

const STATE_STORE_NAME = `vidi-state-store`;
const LOG = false;

/**
 * @type {*|exports|module.exports}
 */
var cloud;

/**
 * @type {*|exports|module.exports}
 */
var setting;

/**
 * @type {*|exports|module.exports}
 */
var baseLayer;

/**
 * @type {*|exports|module.exports}
 */
var setBaseLayer;

/**
 * @type {*|exports|module.exports}
 */
var switchLayer;

/**
 * @type {*|exports|module.exports}
 */
var legend;

/**
 * @type {*|exports|module.exports}
 */
var print;

/**
 * @type {*|exports|module.exports}
 */
var draw;

/**
 * @type {*|exports|module.exports}
 */
var advancedInfo;

/**
 * @type {*|exports|module.exports}
 */
var meta;

/**
 * @type {*|exports|module.exports}
 */
var urlparser = require('./urlparser');

/**
 * @type {string}
 */
var hash = urlparser.hash;

/**
 * @type {array}
 */
var urlVars = urlparser.urlVars;

/**
 *
 * @type {LZString|exports|module.exports}
 */
var lz = require('lz-string');

/**
 *
 * @type {exports|module.exports}
 */
var base64 = require('base64-url');

/**
 *
 * @type {string}
 */
var BACKEND = require('../../config/config.js').backend;

var anchor;

var layers;

var _self;

var backboneEvents;

var layerTree;

var stateSnapshots;

var listened = {};

var p, hashArr = hash.replace("#", "").split("/");

/**
 * Returns internaly stored global state
 * 
 * @returns {Promise}
 */
const _getInternalState = () => {
    let result = new Promise((resolve, reject) => {
        localforage.getItem(STATE_STORE_NAME, (error, value) => {
            if (LOG) console.log('State: after getting state');

            if (error) {
                throw new Error('State: error occured while accessing the store');
            }

            let localState = { modules: {} };
            if (value) {
                localState = JSON.parse(value);
            }

            if (LOG) console.log('State: ', localState);

            resolve(localState);
        });
    });

    return result;
};

/**
 * Sets internaly stored global state
 * 
 * @returns {Promise}
 */
const _setInternalState = (value) => {
    let result = new Promise((resolve, reject) => {
        localforage.setItem(STATE_STORE_NAME, JSON.stringify(value), (error) => {    
            if (error) {
                throw new Error('State: error occured while storing the state');
            } else {
                if (LOG) console.log('State: saved', value);
            }
        });
    });

    return result;
};


/**
 *
 * @type {{set: module.exports.set, init: module.exports.init}}
 */
module.exports = {

    /**
     *
     * @param o
     * @returns {exports}
     */
    set: function (o) {
        anchor = o.anchor;
        cloud = o.cloud;
        setting = o.setting;
        stateSnapshots = o.stateSnapshots;
        setBaseLayer = o.setBaseLayer;
        baseLayer = o.baseLayer;
        switchLayer = o.switchLayer;
        legend = o.legend;
        print = o.print;
        draw = o.draw;
        layers = o.layers;
        advancedInfo = o.advancedInfo;
        meta = o.meta;
        layerTree = o.layerTree;
        backboneEvents = o.backboneEvents;
        _self = this;
        return this;
    },

    /**
     * @todo Most of the functionality from this method should be moved to the 
     * corresponding modules and extensions
     */
    init: function () {
        _self = this;

        if ('localforage' in window === false) {
            throw new Error('localforage is not defined');
        }

        var arr, i, maxBounds = setting.getMaxBounds();

        if (maxBounds) {
            cloud.get().setMaxBounds(maxBounds);
        }

        // Reset hash. Needed if state is invoked after start up
        hash = decodeURIComponent(window.location.hash);
        hashArr = hash.replace("#", "").split("/");

        const removeDuplicates = (inputArray) => {
            var temp = {};
            for (var i = 0; i < inputArray.length; i++) {
                temp[inputArray[i]] = true;
            }

            var result = [];
            for (var key in temp) {
                result.push(key);
            }

            return result;
        };

        const setLayers = () => {
            $(".base-map-button").removeClass("active");
            $("#" + hashArr[0]).addClass("active");
            let layersToActivate = [];

            let baseLayerId = false;
            if (hashArr[1] && hashArr[2] && hashArr[3]) {
                baseLayerId = hashArr[0];

                // Layers to activate
                if (hashArr[4]) {
                    layersToActivate = removeDuplicates(hashArr[4].split(","));
                }
            }

            /**
             * Creates promise
             * 
             * @param {String} data Input data for underlying function
             * 
             * @return {Function} 
             */
            const createPromise = (data) => {
                return new Promise(resolve => {
                    switchLayer.init(data, true, true).then(() => {
                        resolve();
                    });
                })
            };

            /**
             * Executes promises one after another
             * 
             * @param {Array} data Set of input values
             */
            const executeSequentially = (data) => {
                return createPromise(data.shift()).then(x => data.length == 0 ? x : executeSequentially(data));
            };

            const initializeLayersFromURL = () => {
                executeSequentially(layersToActivate).then(() => {});
            };

            if (layerTree.isReady()) {
                setBaseLayer.init(baseLayerId);
                initializeLayersFromURL();
            } else {
                backboneEvents.get().once(`layerTree:ready`, () => {
                    setBaseLayer.init(baseLayerId);
                    initializeLayersFromURL();
                });
            }
        };

        /**
         * Applies settings provided in the URL hash part
         */
        const initializeFromHashPart = () => {
            // When all layers are loaded, when load legend and when set "all_loaded" for print
            backboneEvents.get().once("allDoneLoading:layers", function (e) {
                legend.init().then(function(){
                    console.log("Vidi is now loaded");// Vidi is now fully loaded
                    window.status = "all_loaded";
                });
            });

            if (urlVars.k === undefined) {
                if (hashArr[0]) {
                    setLayers();
                } else {
                    // Set base layer to the first added one
                    setBaseLayer.init(baseLayer.getAvailableBaseLayers()[0].id);
                    var extent = setting.getExtent();
                    if (extent !== null) {
                        cloud.get().zoomToExtent(extent);
                    } else {
                        cloud.get().zoomToExtent();
                    }
                }
            } else {
                var parr, v, l, t, GeoJsonAdded = false;
                parr = urlVars.k.split("#");
                if (parr.length > 1) {
                    parr.pop();
                }

                $.ajax({
                    dataType: "json",
                    method: "get",
                    url: '/api/postdata/',
                    data: {
                        k: parr.join()
                    },
                    scriptCharset: "utf-8",
                    success: function (response) {
                        if (response.data.bounds !== null) {
                            var bounds = response.data.bounds;
                            cloud.get().map.fitBounds([bounds._northEast, bounds._southWest], {animate: false})
                        }

                        if (response.data.customData !== null) {
                            backboneEvents.get().trigger("on:customData", response.data.customData);
                        }

                        // Recreate print
                        // ==============
                        if (response.data.print !== null) {
                            GeoJsonAdded = false;
                            parr = response.data.print;
                            v = parr;
                            $.each(v[0].geojson.features, function (n, m) {
                                if (m.type === "Rectangle") {
                                    var g = L.rectangle([m._latlngs[0], m._latlngs[2]], {
                                        fillOpacity: 0,
                                        opacity: 1,
                                        color: 'red',
                                        weight: 1
                                    });
                                    g.feature = m.feature;
                                    cloud.get().map.addLayer(g);
                                    setTimeout(function () {
                                        var bounds = g.getBounds(),
                                            sw = bounds.getSouthWest(),
                                            ne = bounds.getNorthEast(),
                                            halfLat = (sw.lat + ne.lat) / 2,
                                            midLeft = L.latLng(halfLat, sw.lng),
                                            midRight = L.latLng(halfLat, ne.lng),
                                            scaleFactor = ($("#pane1").width() / (cloud.get().map.project(midRight).x - cloud.get().map.project(midLeft).x));

                                        $("#container1").css("transform", "scale(" + scaleFactor + ")");
                                        $(".leaflet-control-scale-line").prependTo("#scalebar").css("transform", "scale(" + scaleFactor + ")");
                                        $(".leaflet-control-scale-line").prependTo("#scalebar").css("transform-origin", "left bottom 0px");
                                        $("#scale").html("1 : " + response.data.scale);
                                        $("#title").html(decodeURIComponent(urlVars.t));
                                        parr = urlVars.c.split("#");
                                        if (parr.length > 1) {
                                            parr.pop();
                                        }
                                        $("#comment").html(decodeURIComponent(parr.join()));

                                        if (hashArr[0]) {
                                            setLayers()
                                        }
                                        cloud.get().map.removeLayer(g);
                                    }, 0)
                                }
                            });
                        }

                        // Recreate Drawings
                        // =================

                        if (response.data.draw !== null) {
                            draw.recreateDrawnings(response.data.draw);
                        }

                        // Recreate query draw
                        // ===================

                        if (response.data.queryDraw !== null) {
                            GeoJsonAdded = false;
                            parr = response.data.queryDraw;
                            v = parr;
                            l = advancedInfo.getDrawLayer();
                            $.each(v[0].geojson.features, function (n, m) {
                                if (m.type === "Feature" && GeoJsonAdded === false) {
                                    var g = L.geoJson(v[0].geojson, {
                                        style: function (f) {
                                            return f.style;
                                        }
                                    });
                                    $.each(g._layers, function (i, v) {
                                        l.addLayer(v);
                                    });
                                    GeoJsonAdded = true;
                                }
                                if (m.type === "Circle") {
                                    g = L.circle(m._latlng, m._mRadius, m.style);
                                    g.feature = m.feature;
                                    l.addLayer(g);
                                }
                                if (m.type === "Rectangle") {
                                    g = L.rectangle([m._latlngs[0], m._latlngs[2]], m.style);
                                    g.feature = m.feature;
                                    l.addLayer(g);
                                }
                                if (m.type === "Marker") {
                                    g = L.marker(m._latlng, m.style);
                                    g.feature = m.feature;
                                    l.addLayer(g);
                                }
                            });
                        }

                        // Recreate query buffer
                        // =====================

                        if (response.data.queryBuffer !== null) {
                            GeoJsonAdded = false;
                            parr = response.data.queryBuffer;
                            v = parr;
                            l = advancedInfo.getDrawLayer();
                            $.each(v[0].geojson.features, function (n, m) {
                                if (m.type === "Feature" && GeoJsonAdded === false) {
                                    var g = L.geoJson(v[0].geojson, {
                                        style: function (f) {
                                            return f.style;
                                        }
                                    });
                                    $.each(g._layers, function (i, v) {
                                        l.addLayer(v);
                                    });
                                    GeoJsonAdded = true;
                                }
                            });
                        }


                        // Recreate result
                        // ===============

                        if (response.data.queryResult !== null) {
                            GeoJsonAdded = false;
                            parr = response.data.queryResult;
                            v = parr;
                            $.each(v[0].geojson.features, function (n, m) {
                                if (m.type === "Feature" && GeoJsonAdded === false) {
                                    var g = L.geoJson(v[0].geojson, {
                                        style: function (f) {
                                            return f.style;
                                        }
                                    });
                                    $.each(g._layers, function (i, v) {
                                        cloud.get().map.addLayer(v);
                                    });
                                    GeoJsonAdded = true;
                                }
                                if (m.type === "Circle") {
                                    g = L.circleMarker(m._latlng, m.style);
                                    g.setRadius(m._radius);
                                    g.feature = m.feature;
                                    cloud.get().map.addLayer(g);
                                }
                            });
                        }

                        // Recreate added layers
                        // from layerSearch
                        // =====================

                        var currentLayers = meta.getMetaData();
                        var flag;
                        var addedLayers = [];

                        // Get array with the added layers
                        $.each(response.data.metaData.data, function (i, v) {
                            flag = false;
                            $.each(currentLayers.data, function (u, m) {
                                if (m.f_table_name === v.f_table_name && m.f_table_schema === v.f_table_schema) {
                                    flag = true; // Flag layers from loaded schemata
                                }
                            });
                            if (!flag) {
                                addedLayers.push(v);
                            }
                        });

                        // If any added layers, then add them
                        if (addedLayers.length > 0) {
                            meta.addMetaData({data: addedLayers});
                            layerTree.init();
                            if (arr) {
                                for (i = 0; i < arr.length; i++) {
                                    switchLayer.init(arr[i], true, true);
                                }
                            }
                        }

                    }
                });
            }
        };

        if (urlVars.state) {
            stateSnapshots.getSnapshotByID(urlVars.state).then((state) => {
                if (state) {
                    this.applyState(state.snapshot);
                } else {
                    initializeFromHashPart();
                }
            }).catch(error => {
                console.warn(`Unable to find valid state snapshot with id ${urlVars.state}`);
                initializeFromHashPart();
            });            
        } else {
            initializeFromHashPart();
        }

        backboneEvents.get().trigger("end:state");
    },

    listenTo: (moduleName, module) => {
        if ('getState' in module === false || 'applyState' in module === false) {
            throw new Error(`Module or extension has to implement getState() and applyState() methods in order to support state`);
        }

        listened[moduleName] = module;
    },

    /**
     * Returns current state
     * 
     * @returns {Promise}
     */
    getState: () => {
        return _getInternalState();
    },

    /**
     * Resets current state
     * 
     * @return {Promise}
     */
    resetState: () => {
        let appliedStatePromises = [];
        for (let key in listened) {
            appliedStatePromises.push(listened[key].applyState(false));
        }

        return Promise.all(appliedStatePromises).then(() => {
            return _setInternalState({});
        });
    },

    /**
     * Shortcut for getting specific module or extension state
     * 
     * @param {String} name Name of the module or extension
     * 
     * @returns {Promise}
     */
    getModuleState: (name) => {
        if (!name) {
            throw new Error(`No module name was specified`);
        }

        let result = new Promise((resolve, reject) => {
            // If the state parameter is provided, then locally stored state for module is ignored
            if (urlVars.state) {
                resolve(false);
            } else {
                _getInternalState().then(state => {
                    if ('modules' in state && name in state.modules) {
                        resolve(state.modules[name]);
                    } else {
                        resolve(false);
                    }
                }).catch(error => {
                    console.error(error);
                });
            }
        });

        return result;
    },


    /**
     * Applies state
     * 
     * @param {Object} state Applied state
     * 
     * @returns {Promise}
     */
    applyState: (state) => {
        history.pushState(``, document.title, window.location.pathname + window.location.search);
        let result = new Promise((resolve, reject) => {
            const applyStateToModules = () => {
                let promises = [];
                let modulesWithAppliedState = [];
                if ('modules' in state) {
                    for (let name in state.modules) {
                        if (name in listened) {
                            promises.push(listened[name].applyState(state.modules[name]));
                            modulesWithAppliedState.push(name);
                        } else {
                            console.warn(`Module or extension ${name} is not registered in state module, so its state is not applied`);
                        }
                    }
                }

                for (let key in listened) {
                    if (modulesWithAppliedState.indexOf(key) === -1) {
                        if (`resetState` in listened[key]) {
                            promises.push(listened[key].resetState());
                        }
                    }
                }
    
                Promise.all(promises).then(() => {
                    resolve();
                });
            };

            if ('map' in state) {
                anchor.applyMapParameters(state.map).then(() => {
                    applyStateToModules();
                });
            } else {
                applyStateToModules();
            }
        });

        return result;
    },

    /**
     * Pushes the current saved state to the server (GC2), then displays the link with saved state identifier (bookmark)
     * 
     * @returns {Promise}
     */
    bookmarkState: (customData) => {
        // Getting the print data
        let printData = print.getPrintData(customData);

        // Getting modules and extensions state
        let modulesData = {};

        let overallData = Object.assign({}, printData, modulesData);
        let result = new Promise((resolve, reject) => {
            $.ajax({
                dataType: `json`,
                method: `POST`,
                url: `/api/print/`,
                contentType: `application/json`,
                data: JSON.stringify(overallData),
                scriptCharset: `utf-8`,
                success: resolve,
                error: reject
            });
        });

        return result;
    },

    setExtent: function () {
        if (hashArr[1] && hashArr[2] && hashArr[3]) {
            p = geocloud.transformPoint(hashArr[2], hashArr[3], "EPSG:4326", "EPSG:900913");
            cloud.get().zoomToPoint(p.x, p.y, hashArr[1]);
        } else {
            cloud.get().zoomToExtent();
        }
    },

    setBaseLayer: function (b) {
        setBaseLayer = b;
    },

    /**
     * Listens to specific events of modules and extensions, then gets their state and updates
     * and saves the overall state locally, so next reload will keep all changes
     */
    listen: (name, eventId) => {
        backboneEvents.get().on(name + ':' + eventId, () => {
            _self._updateStateForModule(name);
        });
    },

    /**
     * Retrieves state for specific module or extension
     * 
     * @param {String} name Module or extension name
     */
    _updateStateForModule: (name) => {
        if (name in listened === false) {
            throw new Error(`Module or extension ${name} does not exist`);
        }

        if ('getState' in listened[name] === false || 'applyState' in listened[name] === false) {
            throw new Error(`Module or extension has to implement getState() and applyState() methods in order to support state`);
        }

        _getInternalState().then(localState => {
            if (`modules` in localState === false || !localState.modules) {
                localState.modules = {};
            }

            localState.modules[name] = listened[name].getState();
            _setInternalState(localState);
        }).catch(error => {
            console.error(error);
        });
    }
};