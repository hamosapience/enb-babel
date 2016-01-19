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
