var inherit = require('inherit'),
    enb = require('enb/lib/api'),
    touch = require('touch');

module.exports = inherit(enb.BaseTech, {
    getName: function () {
        return 'touch';
    },

    configure: function () {
        this._target = this.getRequiredOption('target');
    },

    getTargets: function () {
        return [this.node.unmaskTargetName(this._target)];
    },

    build: function () {
        var node = this.node,
            target = node.unmaskTargetName(this._target),
            filename = node.resolvePath(target);

        touch.sync(filename);
        node.resolveTarget(target);

    },

    clean: function() {}

});