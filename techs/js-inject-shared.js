var enb = require('enb/lib/api');

module.exports = enb.buildFlow.create()
    .name('js-inject-shared')
    .target('destTarget', '?.js')
    .defineRequiredOption('sharedTarget')
    .useSourceText('sourceTarget')
    .needRebuild(function() {
        return true;
    })
    .builder(function (pageIncludeList) {
        var sharedTargetName = this.node.unmaskTargetName(this._options.sharedTarget);

        return this.node.requireSources([sharedTargetName]).then(function() {
            return (
                pageIncludeList +
                '\n' +
                'include("' + sharedTargetName + '");'
            );
        });

    })
    .createTech();