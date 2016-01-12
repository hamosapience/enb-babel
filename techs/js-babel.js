var path = require('path');
var babel = require('babel-core');
var _ = require('lodash');
var fs = require('fs');
var uglifyJS = require("uglify-js-harmony").minify;
var sourceMappingURLTemplate = '\n //# sourceMappingURL=%filename \n';

function minify(code, map, mapFileName) {

    var result = uglifyJS(code, {
        fromString: true,
        outSourceMap: mapFileName,
        inSourceMap: map
    });

    return result;
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
    .needRebuild(function(cache) {

        var source = this._sourceTarget;
        var sourcePath = this.node.resolvePath(source);

        console.log('needRebuild', sourcePath, cache.needRebuildFile('source-file', sourcePath));

        return cache.needRebuildFile('source-file', sourcePath);
    })
    .saveCache(function(cache) {

        var source = this._sourceTarget;
        var sourcePath = this.node.resolvePath(source);

        cache.cacheFileInfo('source-file', sourcePath);
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

        return (result.code);


    })
    .createTech();
