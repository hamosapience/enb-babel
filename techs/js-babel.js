var path = require('path');
var babel = require('babel-core');
var _ = require('lodash');
var fs = require('fs');
var uglifyJS = require("uglify-js-harmony").minify;
var sourceMappingURLTemplate = '\n //# sourceMappingURL=%filename \n';
var crypto = require('crypto');

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
    .builder(function (js) {

        var DEFAULT_BABEL_OPTS = {
            ast: false,
            compact: true,
            comments: false,
            sourceMaps: true,
            sourceMapTarget: this._sourceTarget,
            sourceFileName: this._sourceTarget,
            plugins: this._options.plugins || []
        };
        var babelOptions = _.merge(this._options.babelOptions || {}, DEFAULT_BABEL_OPTS);

        var dirPath = this.node.getDir();

        var sourceCache = this.node.getNodeCache(this._sourceTarget);
        var targetCache = this.node.getNodeCache(this._target);

        var targetCacheData = (targetCache.get('data') && JSON.parse(targetCache.get('data'))) || {};

        var sourceHash = getHash(js);
        var cachedSourceHash = sourceCache.get('hash');

        if (sourceHash === cachedSourceHash && targetCacheData.hash === sourceHash) {
            return targetCacheData.src;
        }

        var mapFileName = (this._target + '.map');
        var mapFilePath = path.join(dirPath, mapFileName);

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
