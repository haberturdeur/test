(function() {
    if (window.ksRunnerInit) return;

    // This line gets patched up by the cloud
    var pxtConfig = {
    "relprefix": "/test/",
    "verprefix": "",
    "workerjs": "/test/worker.js",
    "monacoworkerjs": "/test/monacoworker.js",
    "gifworkerjs": "/test/gifjs/gif.worker.js",
    "serviceworkerjs": "/test/serviceworker.js",
    "typeScriptWorkerJs": "/test/tsworker.js",
    "pxtVersion": "8.0.2",
    "pxtRelId": "localDirRelId",
    "pxtCdnUrl": "/test/",
    "commitCdnUrl": "/test/",
    "blobCdnUrl": "/test/",
    "cdnUrl": "/test/",
    "targetVersion": "0.0.0",
    "targetRelId": "",
    "targetUrl": "",
    "targetId": "microbit",
    "simUrl": "/test/simulator.html",
    "simserviceworkerUrl": "/test/simulatorserviceworker.js",
    "simworkerconfigUrl": "/test/workerConfig.js",
    "partsUrl": "/test/siminstructions.html",
    "runUrl": "/test/run.html",
    "docsUrl": "/test/docs.html",
    "multiUrl": "/test/multi.html",
    "asseteditorUrl": "/test/asseteditor.html",
    "skillmapUrl": "/test/skillmap.html",
    "authcodeUrl": "/test/authcode.html",
    "isStatic": true
};

    var scripts = [
        "/test/highlight.js/highlight.pack.js",
        "/test/marked/marked.min.js",
    ]

    if (typeof jQuery == "undefined")
        scripts.unshift("/test/jquery.js")
    if (typeof jQuery == "undefined" || !jQuery.prototype.sidebar)
        scripts.push("/test/semantic.js")
    if (!window.pxtTargetBundle)
        scripts.push("/test/target.js");
    scripts.push("/test/pxtembed.js");

    var pxtCallbacks = []

    window.ksRunnerReady = function(f) {
        if (pxtCallbacks == null) f()
        else pxtCallbacks.push(f)
    }

    window.ksRunnerWhenLoaded = function() {
        pxt.docs.requireHighlightJs = function() { return hljs; }
        pxt.setupWebConfig(pxtConfig || window.pxtWebConfig)
        pxt.runner.initCallbacks = pxtCallbacks
        pxtCallbacks.push(function() {
            pxtCallbacks = null
        })
        pxt.runner.init();
    }

    scripts.forEach(function(src) {
        var script = document.createElement('script');
        script.src = src;
        script.async = false;
        document.head.appendChild(script);
    })

} ())
