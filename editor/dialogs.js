"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cantImportAsync = void 0;
function cantImportAsync(project) {
    // this feature is support in v0 only
    return project.showModalDialogAsync({
        header: lf("Can't import microbit.co.uk scripts..."),
        body: lf("Importing microbit.co.uk programs is not supported in this editor anymore. Please open this script in the https://makecode.microbit.org/v0 editor."),
        buttons: [
            {
                label: lf("Go to the old editor"),
                url: `https://makecode.microbit.org/v0`
            }
        ]
    }).then(() => project.openHome());
}
exports.cantImportAsync = cantImportAsync;
