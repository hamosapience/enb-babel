/**
 * shared-view3
 * ==
 * Находит все .shared2.json файлы в блоках, берёт серверные шаблоны с сервера и собирает клиентский вариант.
 * Также попутно находит нужные переводы.
 *
 * **Опции**
 *
 * * *String* **lang** — текущий язык сборки, с которым нужно собрать шаблоны
 * * *String* **langFile** — путь до файла с переводами
 * * *String* **viewsVar** — название функции, с помощью которой определяются шаблоны
 * * *String* **libPath** - путь до опционального файла, который будет сложен вместе с шаблонами
 * * *Object* **globals** — глобальные переменные, доступные в процессе эвала шаблонов.
 *
 */

var path = require('path');
var vow = require('vow');
var vowFs = require('vow-fs');
var nodefs = require('fs');
var vm = require('vm');
var rapidoLang = require('rapido-lang');
var FileList = require('enb/lib/file-list');

/**
 * Обрабатывает шаблон перед выводом в js файл
 * @param {String} name Название шаблона
 * @param {String} templateData Получившийся шаблон
 * @returns {String}
 */
function generateView (name, templateData) {
    return 'views("' + name + '",' + templateData + ');';
}

/**
 * Объединяет все строки из объекта
 * @param {Object} obj
 * @returns {String}
 */
function join (obj) {
    var res = '';

    for (var i in obj) {
        if (obj.hasOwnProperty(i)) {
            res += obj[i] + ';\n';
        }
    }

    return res;
}

/**
 * Создаёт объект из массива вида {элемент: true}
 * @param {Array} array
 * @returns {Object}
 */
function makeMap (array) {
    var map = {};

    for (var i = 0; i < array.length; ++i) {
        if (array[i]) {
            map[array[i]] = true;
        }
    }

    return map;
}

/**
 * Удаляет дублирующие элементы из массива
 * @param {Array} array
 * @returns {Array}
 */
function unique (array) {
    return Object.keys(makeMap(array));
}

/**
 * Присваивает свойство объекту, которое может быть глубоко вложено
 * @param {Object} obj
 * @param {String} name Название свойства, может содержать "."
 * @param {*} value Значение, которое нужно положить
 */
function makeProp (obj, name, value) {
    var keys = name.split('.');

    for (var i = 0; i < keys.length; ++i) {
        if (i + 1 === keys.length) {
            obj[keys[i]] = value;
        } else {
            obj[keys[i]] = obj[keys[i]] || {};
            obj = obj[keys[i]];
        }
    }
}

/**
 * Получает глубоко вложенное свойство у объекта
 * @param {Object} obj
 * @param {String} name
 * @returns {*}
 */
function getProp (obj, name) {
    var keys = name.split('.');

    for (var i = 0; i < keys.length; ++i) {
        if (i + 1 === keys.length) {
            return obj[keys[i]];
        } else if (obj[keys[i]]) {
            obj = obj[keys[i]];
        } else {
            break;
        }
    }

    return undefined;
}

/**
 * Создаёт выборучную копию langData, копируя только те ключи, которые описаны в langKeysList
 * @param {Object} langData
 * @param {Array} langKeysList
 * @returns {Object}
 */
function buildRequiredLang (langData, langKeysList) {
    var res = {},
        key;

    for (var i = 0; i < langKeysList.length; ++i) {
        key = langKeysList[i];

        makeProp(res, key, getProp(langData, key));
    }

    return res;
}

/**
 * Обрабатывает сохранение переводов в js-файл
 * @param {Object} langBuffer
 * @returns {String}
 */
function storeLang (langBuffer) {
    return 'home.lang=' + JSON.stringify(langBuffer, null, 4) + ';';
}

function readSharedJson(path) {
    return vowFs.read(path).then(function(buffer) {
        var config = JSON.parse(buffer.toString());
        config.configPath = path;
        return config;
    });
}

function readBlockConfig(blockConfig) {
    var absViewPath;

    var viewNameList = [];
    var langRequired = [];
    var viewFileList = [];

    if (blockConfig.lang) {
        langRequired = blockConfig.lang;
    }

    if (blockConfig.views) {

        Object.keys(blockConfig.views).forEach(function(viewPath) {
            viewNameList = viewNameList.concat(blockConfig.views[viewPath]);

            var blockName = path.basename(blockConfig.configPath).replace('.shared2.json', '');

            // под this имеется ввиду .view.js И .view.html этого же блока, читает оба в случае необходимости
            if (viewPath === 'this') {
                // viewPath = blockConfig.configPath.replace('.shared2.json', '');
                viewPath = blockName;
            }

            absViewPath = path.resolve(blockConfig.configPath, '..', viewPath);


            if (!/\.view\.(js|html)$/.test(absViewPath)) {
                var found = false;

                if (nodefs.existsSync(absViewPath + '.view.js')) {
                    viewFileList.push(absViewPath + '.view.js');
                    found = true;
                }
                if (nodefs.existsSync(absViewPath + '.view.html')) {
                    viewFileList.push(absViewPath + '.view.html');
                    found = true;
                }

                if (!found) {
                    throw new Error('View ' + absViewPath + ' not found!');
                }
            } else {
                viewFileList.push(absViewPath);
            }

        });

    }

    return {
        viewNameList: viewNameList,
        langRequired: langRequired,
        viewFileList: viewFileList
    };
}

function readViewContent(viewAbsPath) {
    return vowFs.read(viewAbsPath).then(function (viewContents) {
        return rapidoLang.applyTransforms(viewAbsPath, viewContents.toString(), null);
    });
}

var blockConfigsPromise = null;
var sharedDataPromise = null;
var viewsDataPromise = null;

var langRequired;
var viewNameMap;

module.exports = require('enb/lib/build-flow').create()
    .name('shared-view3')
    .target('target', '?.{lang}.shared.js')
    .defineOption('globals')
    .defineRequiredOption('lang')
    .needRebuild(function (cache) {
        var sources = cache.get('target:' + this._filesTarget),
            imports = cache.get('prerequisites');

        return !sources || !imports ||
            sources.some(this._needRebuildFile, this) || imports.some(this._needRebuildFile, this);
    })
    .builder(function () {
        var viewBuffer = {};

        var langData = this.getRequiredOption('langData');
        var langName = this.getRequiredOption('lang');
        var usedFiles = [];
        var libContents = this.getOption('libContents');
        var self = this;

        if (!blockConfigsPromise) {
            blockConfigsPromise = vowFs.glob('**/*.shared2.json').then(function(files) {
                return vow.all(files.map(function(file) {
                    return readSharedJson(file);
                }));
            });
        }

        if (!sharedDataPromise) {
            sharedDataPromise = blockConfigsPromise.then(function(blockConfigs) {
                return blockConfigs.map(readBlockConfig).reduce(function(data, blockData) {
                    data.langRequired = data.langRequired.concat(blockData.langRequired);
                    data.viewNameList = data.viewNameList.concat(blockData.viewNameList);
                    data.viewFileList = data.viewFileList.concat(blockData.viewFileList);
                    return data;
                }, {
                    langRequired: [],
                    viewNameList: [],
                    viewFileList: []
                });
            }).catch(function(err) {
                console.error(err);
            });
        }

        if (!viewsDataPromise) {
            viewsDataPromise = sharedDataPromise.then(function(sharedData) {
                var uniqueViewFiles = unique(sharedData.viewFileList);

                langRequired = sharedData.langRequired;
                viewNameMap = makeMap(sharedData.viewNameList);

                // usedFiles = usedFiles.concat(uniqueViewFiles);
                // self._prepareCache(usedFiles);

                return vow.all(uniqueViewFiles.map(readViewContent));
            }).then(function(viewsData) {
                return viewsData.join(';');
            });
        }

        return viewsDataPromise.then(function(viewsData) {
            var context = self._globals || {};
            var requiredLangObj;
            var viewNameMapLocal = JSON.parse(JSON.stringify(viewNameMap));

            // Обрабатывает вызов шаблона
            makeProp(context, 'views', function (name, template) {
                var defString;
                var required;

                if (name in viewNameMapLocal) {
                    if (!viewNameMapLocal[name]) {
                        throw new Error('<shared-view2>: Duplicate view with name "' + name + '"');
                    }
                    viewNameMapLocal[name] = false;

                    defString = template.toString();

                    if (typeof template === 'function') {
                        // оборачиваем в скобки, чтобы получить function expression
                        defString = '(' + defString + ')';
                        defString = rapidoLang.inlineLangKeys(langData[langName], langName, '<shared-view2>', defString);
                        required = rapidoLang.calcRequiredKeys(defString);
                        if (required) {
                            langRequired = langRequired.concat(rapidoLang.calcRequiredKeys(defString));
                        }
                    } else {
                        // оборачиваем в кавычки, чтобы получить корректный js-код (хоть и очень простой)
                        defString = '"' + defString.replace(/"/g, '\\"') + '"';
                        defString = rapidoLang.inlineLangKeys(langData[langName], langName, '<shared-view2>', defString);
                    }

                    viewBuffer[name] = generateView(name, defString);
                }
            });

            vm.runInNewContext(viewsData, context, '<shared-view2 generated code>');

            for (var viewName in viewNameMapLocal) {
                if (viewNameMapLocal.hasOwnProperty(viewName)) {
                    if (viewNameMapLocal[viewName]) {
                        throw new Error('<shared-view2>: cannot find view with name "' + viewName + '"');
                    }
                }
            }

            requiredLangObj = buildRequiredLang(langData[langName], unique(langRequired));

            // содержимое результирующего *.{lang}.shared.js
            return storeLang(requiredLangObj) +
                '(function(){' +
                libContents.toString() +
                join(viewBuffer) +
                '})();';
        });
    })
    .methods({
        _prepareCache: function(files) {
            var target = this._target,
                cache = this.node.getNodeCache(target),
                list = files.map(function (filename) {
                    return FileList.getFileInfo(filename);
                });

            cache.cacheFileList('prerequisites', list);
        },
        _needRebuildFile: function (file) {
            return !nodefs.existsSync(file.fullname) || file.mtime !== FileList.getFileInfo(file.fullname).mtime;
        }
    })
    .createTech();
