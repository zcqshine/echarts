/**
 * echarts组件： 网格
 * 
 * @module echarts/component/grid
 * 
 * @author Kener (@Kener-林峰, kener.linfeng@gmail.com)
 *         Yi Shen(http://github.com/pissang)
 * TODO
 *  - eventRiver
 *  - move shape construction out of grid
 */
define(function (require) {

    var Base = require('./base');
    var number = require('../util/number');
    var parsePercent = number.parsePercent;

    var Cartesian = require('../coord/Cartesian');
    var IntervalScale = require('../coord/scale/Interval');
    var OrdinalScale = require('../coord/scale/Ordinal');
    var Axis = Cartesian.Axis;

    // 图形依赖
    var RectangleShape = require('zrender/shape/Rectangle');
    
    var zrUtil = require('zrender/tool/util');

    var ecConfig = require('../config');
    var ecQuery = require('../util/ecQuery');
    var deepQuery = ecQuery.deepQuery;
    var query = ecQuery.query;
    var queryValue = ecQuery.queryValue;

    // 网格
    ecConfig.grid = {
        zlevel: 0,                  // 一级层叠
        z: 0,                       // 二级层叠
        x: 80,
        y: 60,
        x2: 80,
        y2: 60,
        // width: {totalWidth} - x - x2,
        // height: {totalHeight} - y - y2,
        backgroundColor: 'rgba(0,0,0,0)',
        borderWidth: 1,
        borderColor: '#ccc'
    };
    	
    /**
     * Extend axis 2d
     * @constructor module:echarts/component/grid~Axis2D
     * @extends {module:echarts/coord/Cartesian.Axis}
     * @param {string} name
     * @param {} scale
     * @param {Array.<number>} coordExtent
     * @param {string} axisType
     * @param {string} position
     *
     * @inner
     */
    var Axis2D = function (name, scale, coordExtent, axisType, position) {
        Axis.call(this, name, scale, coordExtent);
        /**
         * Axis type
         *  - 'category'
         *  - 'value'
         *  - 'time'
         *  - 'log'
         * @type {string}
         */
        this.type = axisType || 'value';
        
        /**
         * Axis position
         *  - 'top'
         *  - 'bottom'
         *  - 'left'
         *  - 'right' 
         */
        this.position = position || 'bottom';
        
        /**
         * Coord on the other axis
         */
        this.otherCoord = 0;

        /**
         * Reference to the other axis
         * @type {module:echarts/component/grid~Axis2D}
         */
        this.otherAxis = null;
    };
    
    Axis2D.prototype = {
        
        constructor: Axis2D,
        
        isHorizontal: function () {
            var position = this.position;
            return position === 'top' || position === 'bottom';
        }
    };
    zrUtil.inherits(Axis2D, Axis);

    /**
     * @constructor
     * @alias module:echarts/component/grid
     * @extends {module:echarts/component/base}
     */
    function Grid(ecTheme, messageCenter, zr, option, myChart) {
        Base.call(this, ecTheme, messageCenter, zr, option, myChart);

        this._coordsMap = {};

        this._coordsList = [];

        this._axesList = [];

        this.refresh(option);
    }
    
    Grid.prototype = {
        type: ecConfig.COMPONENT_TYPE_GRID,

        getX: function () {
            return this._x;
        },

        getY: function () {
            return this._y;
        },

        getWidth: function () {
            return this._width;
        },

        getHeight: function () {
            return this._height;
        },

        getXend: function () {
            return this._x + this._width;
        },

        getYend: function () {
            return this._y + this._height;
        },

        getRect: function () {
            return {
                x: this._x,
                y: this._y,
                width: this._width,
                height: this._height
            };
        },
        
        getBbox: function() {
            return [
                [this._x, this._y],
                [this.getXend(), this.getYend()]
            ];
        },

        refresh: function (newOption) {
            var zr = this.zr;
            var zrWidth = zr.getWidth();
            var zrHeight = zr.getHeight();
            if (newOption
                || this._zrWidth != zrWidth
                || this._zrHeight != zrHeight
            ) {
                this.clear();
                this.option = newOption || this.option;
                this.option.grid = this.reformOption(this.option.grid);
    
                var gridOption = this.option.grid;
                this._x = parsePercent(gridOption.x, zrWidth);
                this._y = parsePercent(gridOption.y, zrHeight);
                var x2 = parsePercent(gridOption.x2, zrWidth);
                var y2 = parsePercent(gridOption.y2, zrHeight);

                this._zrWidth = zrWidth;
                this._zrHeight = zrHeight;
    
                if (gridOption.width == null) {
                    this._width = zrWidth - this._x - x2;
                }
                else {
                    this._width = parsePercent(gridOption.width, zrWidth);
                }
                this._width = this._width <= 0 ? 10 : this._width;
    
                if (gridOption.height == null) {
                    this._height = zrHeight - this._y - y2;
                }
                else {
                    this._height = parsePercent(gridOption.height, zrHeight);
                }
                this._height = this._height <= 0 ? 10 : this._height;
                
                this._x = this.subPixelOptimize(this._x, gridOption.borderWidth);
                this._y = this.subPixelOptimize(this._y, gridOption.borderWidth);
    
                var rect = new RectangleShape({
                    zlevel: this.getZlevelBase(),
                    z: this.getZBase(),
                    hoverable: false,
                    style: {
                        x: this._x,
                        y: this._y,
                        width: this._width,
                        height: this._height,
                        brushType: gridOption.borderWidth > 0 ? 'both' : 'fill',
                        color: gridOption.backgroundColor,
                        strokeColor: gridOption.borderColor,
                        lineWidth: gridOption.borderWidth
                    }
                });
                this.zr.addShape(rect);
                
                this.shapeList.push(rect);
            }

            this._initCartesian(this.option);
        },
    	
        /**
         * Get all cartesian instances
         */
        getAllCartesians: function () {
            return this._coordsList.slice();
        },

        /**
         * Get cartesian instance
         * @param  {number} xIndex
         * @param  {number} yIndex
         * @return {module:echarts/coord/Cartesian}
         */
        getCartesian: function (xIndex, yIndex) {
            var key = 'x' + xIndex + 'y' + yIndex;
            return this._coordsMap[key];
        },

        /**
         * Convert series data to coorindates 
         * @param {Array} data
         * @param {number} [xAxisIndex=0]
         * @param {number} [yAxisIndex=0]
         * @return {Array}
         *  Return list of coordinates. For example:
         *  `[[10, 10], [20, 20], [30, 30]]`
         */
        dataToCoords: function (data, xAxisIndex, yAxisIndex) {
            xAxisIndex = xAxisIndex || 0;
            yAxisIndex = yAxisIndex || 0;

            var cartesian = this.getCartesian(xAxisIndex, yAxisIndex);
            var categoryAxis = cartesian.getAxesByScale('ordinal')[0];
            var coordGetter;
            if (categoryAxis) {
                // Another value axis
                var otherAxisName = categoryAxis.name === 'x' ? 'y' : 'x';
                var otherAxis = cartesian.getAxis(otherAxisName);

    	        var anotherCoordIndex = otherAxis.isHorizontal() ? 0 : 1; 

                coordGetter = function (dataItem, dataIndex) {
                    var coord = [];
                    var value = queryValue(dataItem, 0);
                    coord[1 - anotherCoordIndex] = categoryAxis.dataToCoord(dataIndex);
                    coord[anotherCoordIndex] = otherAxis.dataToCoord(value);

                    return coord;
                };
            }
            else {  	// Both axes are type value
                var axisX = cartesian.getAxis('x');
                var axisY = cartesian.getAxis('y');
                
                var axisXCoordIndex = axisX.isHorizontal() ? 0 : 1; 

                coordGetter = function (dataItem, dataIndex) {
                    var coord = [];
                    var value = queryValue(dataItem, 0);
                    coord[axisXCoordIndex] = axisX.dataToCoord(value[0]); 
                    coord[1 - axisXCoordIndex] = axisY.dataToCoord(value[0]);
                    return coord;
                };
            }

            return zrUtil.map(data, coordGetter);
        },

        /**
         * Initialize cartesian coordinate systems
         * @private
         */
        _initCartesian: function (option) {
            var xAxesList = option.xAxis;
            var yAxesList = option.yAxis;
            var gridX = this._x;
            var gridY = this._y;
            var gridWidth = this._width;
            var gridHeight = this._height;

            if (! (xAxesList instanceof Array)) {
                xAxesList = [xAxesList];
            }
            if (! (yAxesList instanceof Array)) {
                yAxesList = [yAxesList];
            }

            /**
             * @inner
             */
            var getScaleByOption = function (axisType, axisOption) {
                if (axisOption.type) {
                    return axisOption.type === 'value'
                        ? new IntervalScale()
                        : new OrdinalScale(axisOption.data);
                }
                else {
                    return axisType === 'y'
                        ? new IntervalScale()
                        : new OrdinalScale(axisOption.data);
                }
            };

            var gridPositionOccupied = {
                left: false,
                top: false,
                bottom: false,
                right: false
            };

            // Find if any axis has position make the x axis vertical orientation
            var isXHorizontal = true;
            var position;
            var xAxesLen = xAxesList.length;
            var yAxesLen = yAxesList.length;
            for (i = 0; i < xAxesLen; i++) {
                // If has vertical x axis
                position = xAxesList[i].position;
                if (position === 'left' || position === 'right') {
                    isXHorizontal = false;
                    break;
                }
            }
            if (isXHorizontal) {
                // If has horizontal y axis
                for (i = 0; i < yAxesLen; i++) {
                    position = yAxesList[i].position;
                    if (position === 'top' || position === 'bottom') {
                        isXHorizontal = false;
                        break;
                    }
                }
            }
            /**
             * @inner
             */
            var getCoordExtent = function (name, axisType, axisOption) {
                var position = axisOption.position;
                if (! position) {
                    // Default axis position:
                    //  x axis on the bottom and y axis on the left
                    if (
                        (name === 'x' && isXHorizontal)
                        || (name === 'y' && ! isXHorizontal)
                    ) {
                        position = gridPositionOccupied.bottom ? 
                            'top ' : 'bottom';
                    }
                    else {
                        position = gridPositionOccupied.left ? 
                            'right ' : 'left';
                    }
                }

                // Take the position on the grid
                gridPositionOccupied[position] = true;

                var extent;
                switch (position) {
                    case 'top':
                        extent = [gridX, gridX + gridWidth, gridY, position];
                        break;
                    case 'left':
                        extent = [gridY, gridY + gridHeight, gridX, position];
                        break;
                    case 'right':
                        extent = [gridY, gridY + gridHeight, gridX + gridWidth, position];
                        break;
                    default: // Bottom
                        extent = [gridX, gridX + gridWidth, gridY + gridHeight, position];
                        break;
                }

                // Category axis with boundary gap. Which label and points are on the center of bands
                // Insead of on the tick
                if (deepQuery([axisOption, ecConfig[axisType + 'Axis']], 'boundaryGap')
                    && axisType === 'category') {
                    var size = extent[1] - extent[0];
                    var len = axisOption.data.length;
                    var margin = size / len / 2;
                    extent[0] += margin;
                    extent[1] -= margin;
                }

                return extent;
            };

            for (var i = 0; i < xAxesLen; i++) {
                var xAxisOpt = xAxesList[i];
                for (var j = 0; j < yAxesLen; j++) {
                    var yAxisOpt = yAxesList[j];
                    var key = 'x' + i + 'y' + j;
                    var cartesian = new Cartesian(key);
                    this._coordsMap[key] = cartesian;
                    this._coordsList.push(cartesian);

                    // X Axis is default category
                    var xAxisType = xAxisOpt.type || 'category';
                    // Create x axis
                    var coordExtent = getCoordExtent('x', xAxisType, xAxisOpt);
                    var axisX = new Axis2D(
                        'x', getScaleByOption(xAxisOpt, xAxisOpt),
                        coordExtent.slice(0, 2),
                        xAxisOpt.type,
                        coordExtent[3]
                    );
                    axisX.otherCoord = coordExtent[2];
                    cartesian.addAxis(axisX);

                    // X Axis is default value
                    var yAxisType = yAxisOpt.type || 'value';
                    // Create y axis
                    var coordExtent = getCoordExtent('y', yAxisType, yAxisOpt);
                    var axisY = new Axis2D(
                        'y', getScaleByOption(yAxisType, yAxisOpt),
                        coordExtent.slice(0, 2),
                        yAxisOpt.type,
                        coordExtent[3]
                    );
                    axisY.otherCoord = coordExtent[2];
                    cartesian.addAxis(axisY);
                    
                    axisX.otherAxis = axisY;
                    axisY.otherAxis = axisX;

                    var horizontalAxis;
                    var verticalAxis;
                    // Adjust axis direction
                    if (axisX.isHorizontal()) {
                        horizontalAxis = axisX;
                        verticalAxis = axisY;
                    }
                    else {
                        horizontalAxis = axisY;
                        verticalAxis = axisX;    
                    }
                    if (horizontalAxis.position === 'bottom') {
                        // Reverse vertical axis to bottom-up direction
                        verticalAxis.reverse();
                    }
                    if (verticalAxis.position === 'right') {
                        // Reverse horizontal axis to right-left direction
                        horizontalAxis.reverse();
                    }

                    this._axesList.push(axisX);
                    this._axesList.push(axisY);
                }
            }

            this._updateCartesianFromSeries(option.series);

            // Set axis from option
            zrUtil.each(this._axesList, function (axis) {
                axis.scale.niceExtent();
            });

            // Adjust axis coord on the zero position of the other axis
            zrUtil.each(this._axesList, function (axis) {
                var nameShort = axis.type;
                var name = nameShort + 'Axis';
                var onZero = deepQuery([option, ecConfig], name + '.axisLine.onZero');
                var otherAxis = axis.otherAxis;
                if (onZero && otherAxis.type !== 'category') {
                    axis.otherCoord = otherAxis.dataToCoord(0);
                }
            });
        },

        /**
         * Update cartesian properties from series
         * @param  {Array.<Object>} seriesArray
         * @private
         */
        _updateCartesianFromSeries: function (seriesArray) {

            // TODO Event River
            var stackDataMap = {};
            var coordDataMap = {};
            zrUtil.each(seriesArray, function (series, idx) {
                var chartType = series.type;
                var defaultCfg = ecConfig[chartType];
                var queryTarget = [series, defaultCfg];
                var coordinateSystem = deepQuery(queryTarget, 'coordinateSystem');

                if (coordinateSystem === 'cartesian') {
                    var xAxisIndex = deepQuery(queryTarget, 'xAxisIndex');
                    var yAxisIndex = deepQuery(queryTarget, 'yAxisIndex');

                    var cartesian = this.getCartesian(xAxisIndex, yAxisIndex);

                    cartesian.series.push(series);
                    
                    var coordKey = chartType + cartesian.name;
                    var stackKey = coordKey + series.stack;
                    // Accumulated data for stack charts
                    var stackData = stackDataMap[stackKey];
                    // Data of one particular coordinate system
                    var coordData = coordDataMap[coordKey];
                    if (! stackData) {
                        stackData = stackDataMap[stackKey] = {
                            // Positive stack
                            px: [],
                            py: [],
                            // Negative stack
                            nx: [],
                            ny: []
                        };
                    }
                    if (! coordData) {
                        coordData = coordDataMap[coordKey] = {
                            cartesian: cartesian,
                            x: [],
                            y: []
                        };
                    }
                    

                    var data = series.data;
                    if (! (data && data.length)) {
                        return;
                    }
                    var categoryAxis = cartesian.getAxesByScale('ordinal');
                    categoryAxis = categoryAxis[0];
                    var valueAxisName;
                    if (categoryAxis) {
                        valueAxisName = categoryAxis.name === 'x' ? 'y' : 'x';
                    }

                    for (var i = 0; i < data.length; i++) {
                        var value = queryValue(data[i], '-');
                        if (value !== '-') {
                            // 双数值轴不支持 stack
                            if (series.stack && categoryAxis) {
                                // Stack
                                var pKey = 'p' + valueAxisName;
                                var nKey = 'n' + valueAxisName;
                                var key = value >= 0 ? pKey : nKey;
                                stackData[pKey][i] = stackData[pKey][i] || 0;
                                stackData[nKey][i] = stackData[nKey][i] || 0;
                                stackData[key][i] += value;

                                coordData[valueAxisName].push(stackData[key][i]);
                            }
                            else if (categoryAxis) {
                                coordData[valueAxisName].push(+value);
                            }
                            else {
                                // 双数值轴
                                coordData.x.push(+value[0]);
                                coordData.y.push(+value[1]);
                            }
                        }
                    }
                }
            }, this);

            zrUtil.each(coordDataMap, function (item) {
                var cartesian = item.cartesian;
                if (item.x.length) {
                    cartesian.getAxis('x').scale.setExtentFromData(item.x);
                }
                if (item.y.length) {
                    cartesian.getAxis('y').scale.setExtentFromData(item.y);
                }
            });
        }
    };
    
    zrUtil.inherits(Grid, Base);
    
    require('../component').define('grid', Grid);
    
    return Grid;
});