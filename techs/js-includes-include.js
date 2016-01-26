/**
 * js-includes-include
 * ===========
 *
 * Собирает *js*-файлы по deps'ам инклудами, сохраняет в виде `?.js`.
 * Может пригодиться в паре с ycssjs (как fastcgi-модуль).
 *
 * Дополнительная функция: добавляет в список инклудов файлы,
 * лежащие в папке блока и называющиеся *.{includeSuffix}
 * Инклуд-файлы добавляются ДО js-файла самого блока.
 *
 * **Опции**
 *
 * * *String* **target** — Результирующий таргет. По умолчанию — `?.js`.
 * * *String* **filesTarget** — files-таргет, на основе которого получается список исходных файлов
 *   (его предоставляет технология `files`). По умолчанию — `?.files`.
 * * *String* **sourceSuffixes** — суффиксы файлов, по которым строится `files`-таргет. По умолчанию — 'js'.
 * * *String* **includeSuffixes** – cуффикс файлов (кроме файла блока), которые попадут в сборку
 *
 * **Пример**
 *
 * ```javascript
 *  nodeConfig.addTech(require('enb-babel-zen/techs/js-includes-include'), {
        includeSuffix: 'include.js'
    });
 */

var Vow = require('vow');
var vowFs = require('vow-fs');
var path = require('path');

module.exports = require('enb/lib/build-flow').create()
    .name('js-includes-include')
    .target('target', '?.js')
    .defineOption('includeSuffix')
    .useFileList('js')
    .builder(function (sourceFiles) {

        var node = this.node;
        var includeSuffix = this._options.includeSuffix;

        return Vow.all(sourceFiles.map(function (file) {

            var dirPath = path.dirname(file.fullname);
            var includePattern = '*.' + includeSuffix;

            return vowFs.glob(path.join(dirPath, includePattern)).then(function(externalIncludes) {

                var includes = externalIncludes.map(function(includePath) {
                    return ('include("' + node.relativePath(includePath) + '");');
                });
                var blockInclude = ('include("' + node.relativePath(file.fullname) + '");');

                includes.push(blockInclude);

                return includes.join('\n');
            });

        })).then(function(inludeList) {
            return inludeList.join('\n');
        });
    })
    .createTech();
