var path = require('path');
var babel = require('babel-core');
var _ = require('lodash');
var fs = require('fs');
var uglifyJS = require("uglify-js-harmony").minify;
var sourceMappingURLTemplate = '\n //# sourceMappingURL=%filename \n';
var crypto = require('crypto');
var Vow = require('vow');
var vowFs = require('vow-fs');

var convert = require('convert-source-map');
var combine = require('combine-source-map');

function minify(code, map, mapFileName) {

    var result = uglifyJS(code, {
        fromString: true,
        outSourceMap: mapFileName,
        inSourceMap: map
    });

    return result;
}

function getHash(content) {
    return crypto.createHash('md5').update(content).digest('hex');
}

// include("../../blocks/v2/i-bem/i-bem.js");

var includeRe = /include\("(.+)"\)/;

module.exports = require('enb/lib/build-flow').create()
    .name('js-babel')
    .target('destTarget', '?.js')
    .defineOption('babelOptions')
    .defineRequiredOption('sourceTarget')
    .defineOption('destTarget')
    .defineOption('minify')
    .defineOption('plugins')
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

        var defaultBabelOptions = _.merge(this._options.babelOptions || {}, {
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

        var transformResults = Vow.all(filenames.map(function(filename) {

            // TODO: где-то здесь кэширование

            return vowFs.read(node.resolvePath(filename), 'utf8').then(function(fileContent) {

                var babelOptions = _.merge(defaultBabelOptions, {
                    sourceMapTarget: filename,
                    sourceFileName: filename
                });

                return babel.transform(fileContent, babelOptions);
            });

        }));

        var result = transformResults.then(function(transformedContent) {

            var bundleSourceMap = combine.create(mapFileName);

            // var sourceMap = convert.fromObject(transformedContent.map).toComment();
            //

            var lines = 0;

            transformedContent.forEach(function(content) {

                var stringifiedMap = convert.fromObject(content.map).toComment();
                var source = content.map.sourcesContent[0];
                var lineCount = content.code.split(/\r\n|\r|\n/).length;

                bundleSourceMap.addFile({
                    source: (source + '\n' + stringifiedMap),
                    sourceFile: content.map.file
                }, {
                    line: lines
                });

                lines += lineCount;

            });

            var bundleSourceMapBase64 = bundleSourceMap.base64();
            var bundleSourceMapObject = convert.fromBase64(bundleSourceMapBase64).toObject();

            // bundleSourceMapObject.sources = [target];
            bundleSourceMapObject.file = target;


            fs.writeFileSync(mapFilePath, JSON.stringify(bundleSourceMapObject));


            // var sourceMaps = transformedContent.map(function(content) {
            //     return content.map;
            // });

            var code = transformedContent
                .map(function(content) {
                    return content.code;
                })
                .join('\n');

            code += sourceMappingURLTemplate.replace('%filename', mapFileName);

            return code;

        });


        return result;


        // Vow.all(filenames.map(function(filename) {
        //     return vowFs.read(filename);
        // }))
        // .then(function(fileContents) {
        //     console.log(fileContents);
        // })






        // console.log(filenames);









        var sourceCache = this.node.getNodeCache(this._sourceTarget);
        var targetCache = this.node.getNodeCache(this._target);

        var targetCacheData = (targetCache.get('data') && JSON.parse(targetCache.get('data'))) || {};

        var sourceHash = getHash(js);
        var cachedSourceHash = sourceCache.get('hash');

        console.log('targetCacheData', targetCacheData && targetCacheData.hash, 'sourceHash', sourceHash);

        if (sourceHash === cachedSourceHash && targetCacheData.hash === sourceHash) {
            return targetCacheData.src;
        }

        var transformResult = babel.transform(js, babelOptions);

        var result;

        if (this._options.minify) {
            result = minify(transformResult.code, transformResult.map, mapFileName);
        } else {
            // Если не надо сжимать, руками вклеиваем ссылку на source map
            result = transformResult;
            result.code = result.code + sourceMappingURLTemplate.replace('%filename', mapFileName);
            result.map = JSON.stringify(result.map);
        }

        fs.writeFileSync(mapFilePath, result.map);

        sourceCache.set('hash', sourceHash);
        targetCache.set('data', JSON.stringify({
            src: result.code,
            hash: sourceHash
        }));

        return (result.code);


    })
    .createTech();
