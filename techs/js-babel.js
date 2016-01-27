var path = require('path');
var babel = require('babel-core');
var merge = require('lodash.merge');
var uglifyJS = require("uglify-js-harmony").minify;
var Vow = require('vow');
var vowFs = require('vow-fs');
var concat = require("source-map-concat");

var sourceMappingURLTemplate = '\n //# sourceMappingURL=%filename \n';
var includeRe = /include\("(.+)"\)/;

function minify(code, map, mapFileName) {

    var result = uglifyJS(code, {
        fromString: true,
        outSourceMap: mapFileName,
        inSourceMap: map
    });

    return result;
}

function getCacheMtimeKey(filename/*: string */)/*: string */ {
    return (filename + '-mtime');
}

function getCacheResultKey(filename/*: string */)/*: string */ {
    return (filename + '-result');
}

module.exports = require('enb/lib/build-flow').create()
    .name('js-babel')
    .target('destTarget', '?.js')
    .defineOption('babelOptions')
    .defineRequiredOption('sourceTarget')
    .defineOption('destTarget')
    .defineOption('minify')
    .defineOption('plugins')
    .defineOption('polyfillPath')
    .useSourceText('sourceTarget')
    .needRebuild(function() {
        return true;
    })
    .builder(function (includeList) {

        var node = this.node;
        var cache = this.node.getNodeCache(this._target);
        var dirPath = this.node.getDir();
        var mapFileName = (this._target + '.map');
        var mapFilePath = path.join(dirPath, mapFileName);
        var target = this._target;
        var shouldMinify = this._options.minify;

        var defaultBabelOptions = merge(this._options.babelOptions || {}, {
            ast: false,
            compact: true,
            comments: false,
            sourceMaps: true,
            plugins: this._options.plugins || []
        });

        var filenames = includeList.split('\n')
            .map(function(line) {
                return line.match(includeRe);
            })
            .filter(function(includeData) {
                return !!includeData;
            })
            .map(function(includeData) {
                return includeData[1];
            });

        if (this._options.polyfillPath) {
            filenames.unshift(this._options.polyfillPath);
        }

        var transformResults = Vow.all(filenames.map(function(filename) {

            var filePath = node.resolvePath(filename);

            var cacheMtimeKey = getCacheMtimeKey(filename);
            var cacheResultKey = getCacheResultKey(filename);

            var cachedValue = cache.get(cacheResultKey);

            if (cache.needRebuildFile(cacheMtimeKey, filePath) || !cachedValue) {
                return vowFs.read(filePath, 'utf8').then(function(fileContent) {

                    var babelOptions = merge(defaultBabelOptions, {
                        sourceMapTarget: filename,
                        sourceFileName: filename
                    });

                    var transformResult = babel.transform(fileContent, babelOptions);

                    cache.set(cacheResultKey, JSON.stringify(transformResult));
                    cache.cacheFileInfo(cacheMtimeKey, filePath);

                    return transformResult;
                });
            } else {
                return Vow.when(JSON.parse(cachedValue));
            }

        }));

        var result = transformResults.then(function(transformedContent) {

            var concatenated = concat(transformedContent);

            var r = concatenated.toStringWithSourceMap({
                file: path.basename(target)
            });

            var bundleCode = r.code;
            var bundleSourceMap = r.map;

            if (shouldMinify) {
                result = minify(bundleCode, bundleSourceMap, mapFileName);
            } else {
                // Если не надо сжимать, руками вклеиваем ссылку на source map
                result = {};
                result.code = bundleCode + sourceMappingURLTemplate.replace('%filename', mapFileName);
                result.map = JSON.stringify(bundleSourceMap);
            }

            return vowFs.write(mapFilePath, result.map).then(function() {

                return result.code;
            });

        });

        return result;

    })
    .createTech();
