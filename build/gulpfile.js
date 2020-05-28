'use strict';

// Modules

var gulp = require('gulp');
var fs = require('fs');
var path = require('path');
var gutil = require('gulp-util');
var count = require('gulp-count');
var del = require('del');
var seq = require('run-sequence');
var mkdirp = require('mkdirp');
var merge = require('merge-stream');
var minimist = require('minimist');
var zip = require('gulp-zip');
var crx = require('gulp-crx-pack');
var batch_replace = require('gulp-batch-replace');
var gulpif = require('gulp-if');
var map = require('map-stream');

var po = require('./utils/po');
var test = require('./utils/test');

gulp.task('po.merge', function() {
    po.setWorkspace(workspace);
    return po.merge();
});

gulp.task('po.diff', function() {
    po.setWorkspace(workspace);
    return po.diff('en');
});

gulp.task('po.build', function() {
    let task = getCurrentTask();
    let dest = workspace + vars(task.dest);
    po.setWorkspace(workspace);
    return po.build(dest).pipe(count(task.name + ': ##'));
});

gulp.task('test', function(done) {
    let task = getCurrentTask();
    let runTest = getCurrentConfig()['runTest'];
    if (runTest == true) {
        log('Test run!')
        test(workspace + vars(task.src),  vars(task.testUrl), done);
    } else {
        log('Test skip!')
        done();
    }
});

// Helpers

var log = function(message, color) {
    if (color == 'red') {
        gutil.log(gutil.colors.bgRed(message));
    }
    if (color == 'blue') {
        if (options.simple != '') {
            gutil.log(gutil.colors.bgBlue(message));
        } else {
            gutil.log(message);
        }
    } else if (color == 'green') {
        console.log('');
        gutil.log(gutil.colors.blue.bgGreen(message));
        console.log('');
    } else {
        if (options.simple != '') {
            gutil.log(message);
        }
    }
};

var ensureDir = function(path, doChdir) {
    mkdirp.sync(path);
    var res = fs.realpathSync(path);
    if (doChdir) {
        process.chdir(res);
    }
    return res;
}

var vars = function(val) {
    var config = getCurrentConfig();
    var res = val;
    if (typeof val == 'string') {
        var names = val.match(/\{[a-zA-Z0-9]+\}/g);
        if (names) {
            for (var i = 0; i < names.length; i++) {
                var name = names[i].replace('{', '').replace('}', '');
                if (config[name]) {
                    res = vars(res.replace(names[i], config[name]));
                } else {
                    res = vars(res.replace(names[i], ""));
                }
            }
        }
    }
    return res;
}

var getConfigValue = function(val) {
    var config = getCurrentConfig();
    return config[val];
}

var getConfig = function(filePath) {
    return JSON.parse(fs.readFileSync(filePath));
};

var getCurrentTask = function() {
    var config = getCurrentConfig();
    if (currentTaskIndex >= 0 && currentTaskIndex < config.tasks.length) {
        return config.tasks[currentTaskIndex];
    }
    return undefined;
};

var getCurrentConfig = function() {
    if (currentConfigIndex >= 0 && currentConfigIndex < configs.length) {
        return configs[currentConfigIndex];
    }
    return undefined;
};

var processSrc = function(src) {
    var res = [];
    if (src.constructor === Array) {
        for (var i = 0; i < src.length; i++) {
            if (src[i][0] != '!') {
                res.push(workspace + '/' + vars(src[i]));
            } else {
                res.push('!' + workspace + '/' + vars(src[i].substring(1)));
            }
        }
    } else {
        res.push(workspace + '/' + vars(src));
    }
    return res;
}

var patchByPattern = function(srcObj, patchObj, pattern, processVars) {
    var cnt = 0;
    for (var key in srcObj) {
        if (pattern == '*' || key == pattern) {
            if (typeof srcObj[key] === 'object') {
                cnt += patchSingleLevel(srcObj[key], patchObj, processVars);
            }
        }
    }
    return cnt;
}

var patchSingleLevel = function(srcObj, patchObj, processVars) {
    var cnt = 0;
    for (var key in patchObj) {
        if (typeof patchObj[key] === 'object' && srcObj.hasOwnProperty(key)) {
            cnt += patchSingleLevel(srcObj[key], patchObj[key], processVars);
        } else {
            if (patchObj[key] == '') {
                delete srcObj[key];
            } else {
                srcObj[key] = processVars ? vars(patchObj[key]) : patchObj[key];
            }
            cnt++;
        }
    }
    return cnt;
}

// Options

var knownOptions = {
    string: ['config', 'build_number', 'tag', 'nofail', 'silent', 'simple'],
    default: {
        config: 'https-all.json',
        bump: 'no',
        tag: '',
        nofail: 'no',
        silent: 'no',
        simple: 'no'
    },
};
var options = minimist(process.argv.slice(2), knownOptions);

// Tasks

gulp.task('del', function() {
    var task = getCurrentTask();
    var dirs = [];
    for (var i = 0; i < task.arguments.length; i++) {
        dirs.push(workspace + '/' + vars(task.arguments[i]));
    }
    return del(dirs, {force: true}).then(paths => {
            if (paths.length > 0) {
        log('Deleted files/folders: ' + paths.length);
    }
});
});

gulp.task('copy', function() {
    var task = getCurrentTask();
    var res;
    for (var i = 0; i < task.arguments.length; i++) {
        var one = task.arguments[i];
        var src = processSrc(one.src);
        var stream = gulp.src(src)
            .pipe(gulp.dest(workspace + '/' + vars(one.dest)))
            .pipe(gulpif(options.simple != '', count(task.name + ': ##')));
        if (res) {
            res = merge(res, stream);
        } else {
            res = stream;
        }
    }
    return res;
});

gulp.task('batch_replace', function() {
    var task = getCurrentTask();
    var setting = getCurrentConfig()['replace_strings'];
    var to_replace = [];
    for (var key in setting) {
        to_replace.push([new RegExp(key, 'g'), vars(setting[key])]);
    };

    return gulp.src([workspace + '/' + vars(task.src), '!**/*.png', '!**/*.ttf'])
        .pipe(batch_replace(to_replace))
        .pipe(gulp.dest('./'));
});

gulp.task('patch_maifest', function() {
    var task = getCurrentTask();
    var src = JSON.parse(fs.readFileSync(workspace + '/' + vars(task.src)));
    var cnt = 0;
    var config = getCurrentConfig();
    var patch = config['manifest'];
    if (task.pattern) {
        cnt = patchByPattern(src, patch, vars(task.pattern), true);
    } else {
        cnt = patchSingleLevel(src, patch, true);
    }
    fs.writeFileSync(workspace + '/' + vars(task.src), JSON.stringify(src, 'null', '\t'));
    log('Patched: ' + cnt);
});

gulp.task('patch-assets', function() {
    var task = getCurrentTask();
    var src = JSON.parse(fs.readFileSync(workspace + '/' + vars(task.src)));

    //enableFilters
    var enableFilters = getConfigValue("enableFilters");
    for (var key in src) {
        if (enableFilters.indexOf(key) !== -1 && src[key]["content"] == "filters") {
            src[key]["off"] = false
        } else {
            src[key]["off"] = true
        }
    }

    //extraFilters
    var extraFilters = getConfigValue("extraFilters");
    for (var key in extraFilters) {
        if (!src.hasOwnProperty(key)) {
            src[key] = extraFilters[key];
            src[key]["content"] = "filters";
            src[key]["submitter"] = getConfigValue("name");
        }
    }

    fs.writeFileSync(workspace + '/' + vars(task.src), JSON.stringify(src, 'null', '\t'));
});

gulp.task('zip', function() {
    var task = getCurrentTask();
    return gulp.src(workspace + '/' + vars(task.src) + '/**/*')
        .pipe(zip(vars(task.filename)))
        .pipe(gulp.dest(workspace + '/' + vars(task.dest)));
});

gulp.task('crx', function() {
    var task = getCurrentTask();
    return gulp.src(workspace + '/' + vars(task.src))
        .pipe(crx({
            privateKey: fs.readFileSync(workspace + '/' + vars(task.key), 'utf8'),
            filename: vars(task.filename),
        }))
        .pipe(gulp.dest(workspace + '/' + vars(task.dest)));
});

// Main

// Variables

var configs = [];
var workspace = ''; // Working directory
var currentTaskIndex = undefined; // Use to iterate tasks
var currentConfigIndex = undefined; // Used to iterate configs

gulp.task('getNextConfig', function() {
    currentTaskIndex = -1;
    currentConfigIndex++;
    var config = getCurrentConfig();
    if (config) {
        log('Config #' + currentConfigIndex + ': ' + ensureDir(vars(workspace + '/' + vars(config.dest)), true), 'green');
    } else {
        currentConfigIndex = undefined;
    }
});

gulp.task('getNextTask', function() {
    currentTaskIndex++;
    var task = getCurrentTask();
    if (task) {
        // Run tagged only
        if (options.tag != '') {
            while (!task.tags || task.tags.indexOf(options.tag) < 0) {
                currentTaskIndex++;
                task = getCurrentTask();
                if (!task) {
                    currentTaskIndex = undefined;
                    return;
                }
            }
        }
        // Continue
        var title = task.name ? task.name : '';
        title += title != '' ? ' (' + task.command + ')' : task.command;
        log(title, 'blue');
    } else {
        currentTaskIndex = undefined;
    }
});

gulp.task('builder', function(done) {
    log('Builder started', 'green');
    if (options.config && fs.existsSync(options.config)) {
        // Read config
        var configPath = fs.realpathSync(options.config);
        log('Config: ' + configPath);
        var config = getConfig(configPath);
        workspace = ensureDir(path.dirname(configPath));
        // Process include
        var processInclude = function(config) {
            if (config.include && config.override) {
                var includePath = fs.realpathSync(workspace + '/' + config.include);
                var mainConfig = getConfig(includePath);

                //--build_number option
                var build = mainConfig.build;
                if (options.build_number) build = options.build_number;
                mainConfig.build = build;

                delete config.include;
                patchSingleLevel(mainConfig, config.override, false, 0);
                config = mainConfig;
            } else {
                // LATER: bump version for configs without include
            }
            return config;
        }
        // List of configs or one config?
        if (config.configs) {
            for (var i = 0; i < config.configs.length; i++) {
                configs.push(processInclude(getConfig(workspace + '/' + config.configs[i])));
            }
        } else {
            configs.push(processInclude(config));
        }

        // Create tasks for all configs
        var tasks = [];
        for (var i = 0; i < configs.length; i++) {
            var addConfigTasks = function(config) {
                tasks.push('getNextConfig');
                // Tasks
                for (var i in config.tasks) {
                    var task = config.tasks[i];
                    if (!options.tag || (options.tag != '' && task.tags && task.tags.indexOf(options.tag) >= 0)) {
                        currentTaskIndex = -1;
                        tasks.push('getNextTask');
                        tasks.push(task.command);
                    }
                }
            }
            addConfigTasks(configs[i]);
        }
        currentConfigIndex = -1;
        // Add finalization task
        tasks.push(function() {
            done();
            log('Builder finished', 'green');
        });
        // Run tasks
        seq.apply(this, tasks);
    } else {
        log('Config not found: ' + options.config, 'red');
    }
});