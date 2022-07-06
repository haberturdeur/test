"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mkDAPLinkPacketIOWrapper = void 0;
const imul = Math.imul;
const timeoutMessage = "timeout";
const membase = 0x20000000;
const loadAddr = membase;
const dataAddr = 0x20002000;
const stackAddr = 0x20001000;
const FULL_FLASH_TIMEOUT = 100000; // 100s
const PARTIAL_FLASH_TIMEOUT = 60000; // 60s
const flashPageBIN = new Uint32Array([
    0xbe00be00,
    0x2502b5f0, 0x4c204b1f, 0xf3bf511d, 0xf3bf8f6f, 0x25808f4f, 0x002e00ed,
    0x2f00595f, 0x25a1d0fc, 0x515800ed, 0x2d00599d, 0x2500d0fc, 0xf3bf511d,
    0xf3bf8f6f, 0x25808f4f, 0x002e00ed, 0x2f00595f, 0x2501d0fc, 0xf3bf511d,
    0xf3bf8f6f, 0x599d8f4f, 0xd0fc2d00, 0x25002680, 0x00f60092, 0xd1094295,
    0x511a2200, 0x8f6ff3bf, 0x8f4ff3bf, 0x2a00599a, 0xbdf0d0fc, 0x5147594f,
    0x2f00599f, 0x3504d0fc, 0x46c0e7ec, 0x4001e000, 0x00000504,
]);
// void computeHashes(uint32_t *dst, uint8_t *ptr, uint32_t pageSize, uint32_t numPages)
const computeChecksums2 = new Uint32Array([
    0x4c27b5f0, 0x44a52680, 0x22009201, 0x91004f25, 0x00769303, 0x24080013,
    0x25010019, 0x40eb4029, 0xd0002900, 0x3c01407b, 0xd1f52c00, 0x468c0091,
    0xa9044665, 0x506b3201, 0xd1eb42b2, 0x089b9b01, 0x23139302, 0x9b03469c,
    0xd104429c, 0x2000be2a, 0x449d4b15, 0x9f00bdf0, 0x4d149e02, 0x49154a14,
    0x3e01cf08, 0x2111434b, 0x491341cb, 0x405a434b, 0x4663405d, 0x230541da,
    0x4b10435a, 0x466318d2, 0x230541dd, 0x4b0d435d, 0x2e0018ed, 0x6002d1e7,
    0x9a009b01, 0x18d36045, 0x93003008, 0xe7d23401, 0xfffffbec, 0xedb88320,
    0x00000414, 0x1ec3a6c8, 0x2f9be6cc, 0xcc9e2d51, 0x1b873593, 0xe6546b64,
]);
let startTime = 0;
function log(msg) {
    let now = Date.now();
    if (!startTime)
        startTime = now;
    now -= startTime;
    let ts = ("00000" + now).slice(-5);
    pxt.debug(`dap ${ts}: ${msg}`);
}
const logV = /webusbdbg=1/.test(window.location.href) ? log : (msg) => { };
const setBaudRateOnConnection = !/webusbbaud=0/.test(window.location.href);
const resetOnConnection = !/webusbreset=0/.test(window.location.href);
function murmur3_core(data) {
    let h0 = 0x2F9BE6CC;
    let h1 = 0x1EC3A6C8;
    for (let i = 0; i < data.length; i += 4) {
        let k = pxt.HF2.read32(data, i) >>> 0;
        k = imul(k, 0xcc9e2d51);
        k = (k << 15) | (k >>> 17);
        k = imul(k, 0x1b873593);
        h0 ^= k;
        h1 ^= k;
        h0 = (h0 << 13) | (h0 >>> 19);
        h1 = (h1 << 13) | (h1 >>> 19);
        h0 = (imul(h0, 5) + 0xe6546b64) >>> 0;
        h1 = (imul(h1, 5) + 0xe6546b64) >>> 0;
    }
    return [h0, h1];
}
function bufferConcat(a, b) {
    const r = new Uint8Array(a.length + b.length);
    r.set(a, 0);
    r.set(b, a.length);
    return r;
}
class DAPWrapper {
    constructor(io) {
        this.io = io;
        this.initialized = false;
        this.flashAborted = false;
        this.connectionId = 0;
        this.pbuf = new pxt.U.PromiseBuffer();
        this.pageSize = 1024;
        this.numPages = 256;
        this.usesCODAL = undefined;
        // we don't know yet if jacdac was compiled in the hex
        this.jacdacInHex = undefined;
        this.forceFullFlash = /webusbfullflash=1/.test(window.location.href);
        this.onSerial = (buf, isStderr) => { };
        this.onCustomEvent = (type, payload) => { };
        this.icon = "xicon microbit";
        this.xchgAddr = null;
        this.sendQ = [];
        this.familyID = 0x0D28; // this is the microbit vendor id, not quite UF2 family id
        this.io.onDeviceConnectionChanged = (connect) => {
            log(`device connection changed`);
            this.disconnectAsync()
                .then(() => {
                // we don't know what's being connected
                this.usesCODAL = undefined;
                this.jacdacInHex = undefined;
                if (!connect)
                    return;
                this.reconnectAsync();
            });
        };
        this.io.onData = buf => {
            // console.log("RD: " + pxt.Util.toHex(buf))
            this.pbuf.push(buf);
        };
        this.allocDAP();
    }
    processSerialLine(line) {
        if (this.onSerial) {
            try {
                // catch encoding bugs
                this.onSerial(line, false);
            }
            catch (err) {
                log(`serial decoding error: ${err.message}`);
                pxt.tickEvent("hid.flash.serial.decode.error");
                console.error({ err, line });
            }
        }
    }
    async readSerial() {
        let buf = await this.dapCmdNums(0x83);
        const len = buf[1];
        // concat received data with previous data
        if (len) {
            buf = buf.slice(2, 2 + len);
            if (this.pendingSerial)
                buf = bufferConcat(this.pendingSerial, buf);
            let ptr = 0;
            let beg = 0;
            while (ptr < buf.length) {
                if (buf[ptr] == 10 || buf[ptr] == 13) {
                    ptr++;
                    // eat \r\n
                    while (ptr < buf.length && (buf[ptr] == 10 || buf[ptr] == 13))
                        ptr++;
                    const line = buf.slice(beg, ptr);
                    if (line.length)
                        this.processSerialLine(line);
                    beg = ptr;
                }
                else
                    ptr++;
            }
            buf = buf.slice(beg);
            this.pendingSerial = buf.length ? buf : null;
            if (this.pendingSerial) {
                this.lastPendingSerial = Date.now();
                //logV(`pending serial ${this.pendingSerial.length}`)
            }
        }
        else if (this.pendingSerial) {
            const d = Date.now() - this.lastPendingSerial;
            if (d > 500) {
                this.processSerialLine(this.pendingSerial);
                this.pendingSerial = null;
                this.lastPendingSerial = undefined;
            }
        }
        return len;
    }
    startReadSerial(connectionId) {
        const startTime = Date.now();
        log(`start read serial ${connectionId}`);
        const readSerialLoop = async () => {
            try {
                let numSer = 0;
                let numEv = 0;
                while (connectionId === this.connectionId) {
                    numSer = await this.readSerial();
                    // we need to read jacdac in a tight loop
                    // so we don't miss any event
                    if (this.xchgAddr)
                        numEv = await this.jacdacProcess();
                    else
                        numEv = 0;
                    // no data on either side, wait as little as possible
                    // the browser will eventually throttle this call
                    // https://developer.mozilla.org/en-US/docs/Web/API/setTimeout#reasons_for_delays_longer_than_specified
                    if (!numSer && !numEv)
                        await pxt.U.delay(0);
                }
                log(`stopped serial reader ${connectionId}`);
            }
            catch (err) {
                log(`serial error ${connectionId}: ${err.message}`);
                console.error(err);
                if (connectionId != this.connectionId) {
                    log(`stopped serial reader ${connectionId}`);
                }
                else {
                    pxt.tickEvent("hid.flash.serial.error");
                    const timeRunning = Date.now() - startTime;
                    await this.disconnectAsync(); // force disconnect
                    // if we've been running for a while, try reconnecting
                    if (timeRunning > 1000) {
                        log(`auto-reconnect`);
                        try {
                            await this.reconnectAsync();
                        }
                        catch (e) {
                            if (e.type === "devicenotfound")
                                return;
                            throw e;
                        }
                    }
                }
            }
            finally {
                this.pendingSerial = undefined;
                this.lastPendingSerial = undefined;
            }
        };
        readSerialLoop();
    }
    stopReadersAsync() {
        log(`cancelling connection ${this.connectionId}`);
        this.connectionId++;
        return pxt.Util.delay(200);
    }
    allocDAP() {
        log(`alloc dap`);
        const h = this.io;
        this.dap = new DapJS.DAP({
            write: data => h.sendPacketAsync(new Uint8Array(data)),
            close: this.disconnectAsync,
            read: () => this.recvPacketAsync(),
            //sendMany: sendMany
        });
        this.cortexM = new DapJS.CortexM(this.dap);
    }
    get binName() {
        if (this.usesCODAL === undefined)
            console.warn('try to access codal information before it is computed');
        return (this.usesCODAL ? "mbcodal-" : "mbdal-") + pxtc.BINARY_HEX;
    }
    unsupportedParts() {
        if (this.usesCODAL === undefined)
            console.warn('try to access codal information before it is computed');
        if (!this.usesCODAL) {
            return ["logotouch", "builtinspeaker", "microphone", "flashlog"];
        }
        return [];
    }
    isConnected() {
        return this.io.isConnected() && this.initialized;
    }
    isConnecting() {
        return this.io.isConnecting() || (this.io.isConnected() && !this.initialized);
    }
    async setBaudRate() {
        log(`set baud rate to 115200`);
        const baud = new Uint8Array(5);
        baud[0] = 0x82; // set baud
        pxt.HF2.write32(baud, 1, 115200);
        await this.dapCmd(baud);
        // setting the baud rate on serial may reset NRF (depending on daplink version), so delay after
        await pxt.Util.delay(200);
    }
    async readPageSize() {
        const res = await this.readWords(0x10000010, 2);
        this.pageSize = res[0];
        this.numPages = res[1];
        log(`page size ${this.pageSize}, num pages ${this.numPages}`);
    }
    async reconnectAsync() {
        log(`reconnect`);
        this.initialized = false;
        this.flashAborted = false;
        this.io.onConnectionChanged();
        function stringResponse(buf) {
            return pxt.U.uint8ArrayToString(buf.slice(2, 2 + buf[1]));
        }
        await this.stopReadersAsync();
        const connectionId = this.connectionId;
        this.allocDAP(); // clean dap apis
        await this.io.reconnectAsync();
        // halt before reading from dap
        // to avoid interference from data logger
        await this.cortexM.halt();
        // before calling into dapjs, we use our dapCmdNums() a few times, which which will make sure the responses
        // to commends from previous sessions (if any) are flushed
        const info = await this.dapCmdNums(0x00, 0x04); // info
        const daplinkVersion = stringResponse(info);
        log(`daplink version: ${daplinkVersion}`);
        const r = await this.dapCmdNums(0x80);
        this.usesCODAL = r[2] == 57 && r[3] == 57 && r[5] >= 51;
        const binVersion = stringResponse(r);
        log(`bin name: ${this.binName} v:${binVersion}`);
        pxt.tickEvent("hid.flash.connect", { codal: this.usesCODAL ? 1 : 0, daplink: daplinkVersion, bin: binVersion });
        if (setBaudRateOnConnection)
            await this.setBaudRate();
        // only init after setting baud rate, in case we got reset
        await this.cortexM.init();
        if (resetOnConnection) {
            log(`reset cortex`);
            await this.cortexM.reset(true);
        }
        await this.readPageSize();
        // jacdac needs to run to set the xchg address
        await this.checkStateAsync(true);
        await this.initJacdac(connectionId);
        this.initialized = true;
        this.io.onConnectionChanged();
        // start jacdac, serial async
        this.startReadSerial(connectionId);
    }
    async checkStateAsync(resume) {
        const states = ["reset", "lockup", "sleeping", "halted", "running"];
        try {
            const state = await this.cortexM.getState();
            log(`cortex state: ${states[state]}`);
            if (resume && state == 3 /* TARGET_HALTED */)
                await this.cortexM.resume();
        }
        catch (e) {
            log(`cortex state failed`);
            pxt.tickEvent("hid.checkstate.error");
            console.debug(e);
        }
    }
    checkAborted() {
        if (this.flashAborted)
            throw new Error(lf("Download cancelled"));
    }
    disconnectAsync() {
        log(`disconnect`);
        this.flashAborted = true;
        this.initialized = false;
        return this.stopReadersAsync()
            .then(() => this.io.disconnectAsync());
    }
    reflashAsync(resp) {
        var _a, _b;
        pxt.tickEvent("hid.flash.start");
        log("reflash");
        startTime = 0;
        // JACDAC_WEBUSB is defined in microsoft/pxt-jacdac/pxt.json
        const codalJson = resp.outfiles["codal.json"];
        this.jacdacInHex = codalJson && !!((_b = (_a = pxt.Util.jsonTryParse(codalJson)) === null || _a === void 0 ? void 0 : _a.definitions) === null || _b === void 0 ? void 0 : _b.JACDAC_WEBUSB);
        this.flashAborted = false;
        return (this.io.isConnected() ? Promise.resolve() : this.io.reconnectAsync())
            .then(() => this.stopReadersAsync())
            .then(() => this.cortexM.init())
            .then(() => this.cortexM.reset(true))
            .then(() => this.checkStateAsync())
            .then(() => this.readUICR())
            .then(uicr => {
            pxt.tickEvent("hid.flash.uicr", { uicr });
            // shortcut, do a full flash
            if (uicr != 0 || this.forceFullFlash) {
                pxt.tickEvent("hid.flash.uicrfail");
                return this.fullVendorCommandFlashAsync(resp);
            }
            // check flash checksums
            return this.computeFlashChecksum(resp)
                .then(chk => {
                pxt.tickEvent("hid.flash.checksum", { quick: chk.quick ? 1 : 0, changed: chk.changed ? chk.changed.length : 0 });
                // let's do a quick flash!
                if (chk.quick)
                    return this.quickHidFlashAsync(chk.changed);
                else
                    return this.fullVendorCommandFlashAsync(resp);
            });
        })
            .then(() => this.checkStateAsync(true))
            .then(() => pxt.tickEvent("hid.flash.success"));
        // don't disconnect here
        // the micro:bit will automatically disconnect and reconnect
        // via the webusb events
    }
    recvPacketAsync() {
        if (this.io.recvPacketAsync)
            return this.io.recvPacketAsync();
        else
            return this.pbuf.shiftAsync();
    }
    dapCmd(buf) {
        return this.io.sendPacketAsync(buf)
            .then(() => this.recvPacketAsync())
            .then(resp => {
            if (resp[0] != buf[0]) {
                pxt.tickEvent('hid.flash.cmderror', { req: buf[0], resp: resp[0] });
                const msg = `bad dapCmd response: ${buf[0]} -> ${resp[0]}`;
                // in case we got an invalid response, try to get another response, in case the current
                // response is a left-over from previous communications
                log(msg + "; retrying");
                return this.recvPacketAsync()
                    .then(resp => {
                    if (resp[0] == buf[0]) {
                        log(msg + "; retry success");
                        return resp;
                    }
                    throw new Error(msg);
                }, err => {
                    throw new Error(msg);
                });
            }
            return resp;
        });
    }
    dapCmdNums(...nums) {
        return this.dapCmd(new Uint8Array(nums));
    }
    fullVendorCommandFlashAsync(resp) {
        log("full flash");
        pxt.tickEvent("hid.flash.full.start");
        const chunkSize = 62;
        let sentPages = 0;
        return pxt.Util.promiseTimeout(FULL_FLASH_TIMEOUT, Promise.resolve()
            .then(() => this.dapCmdNums(0x8A /* DAPLinkFlash.OPEN */, 1))
            .then((res) => {
            log(`daplinkflash open: ${pxt.U.toHex(res)}`);
            if (res[1] !== 0) {
                pxt.tickEvent('hid.flash.full.error.open', { res: res[1] });
                throw new Error(lf("Download failed, please try again"));
            }
            const binFile = resp.outfiles[this.binName];
            log(`bin file ${this.binName} in ${Object.keys(resp.outfiles).join(', ')}, ${(binFile === null || binFile === void 0 ? void 0 : binFile.length) || -1}b`);
            const hexUint8 = pxt.U.stringToUint8Array(binFile);
            log(`hex ${(hexUint8 === null || hexUint8 === void 0 ? void 0 : hexUint8.byteLength) || -1}b, ~${(hexUint8.byteLength / chunkSize) | 0} chunks of ${chunkSize}b`);
            const sendPages = (offset = 0) => {
                const end = Math.min(hexUint8.length, offset + chunkSize);
                const nextPageData = hexUint8.slice(offset, end);
                const cmdData = new Uint8Array(2 + nextPageData.length);
                cmdData[0] = 0x8C; /* DAPLinkFlash.WRITE */
                cmdData[1] = nextPageData.length;
                cmdData.set(nextPageData, 2);
                if (sentPages % 128 == 0) // reduce logging
                    log(`next page ${sentPages}: [${offset.toString(16)}, ${end.toString(16)}] (${Math.ceil((hexUint8.length - end) / 1000)}kb left)`);
                return this.dapCmd(cmdData)
                    .then(() => {
                    this.checkAborted();
                    if (end < hexUint8.length) {
                        sentPages++;
                        return sendPages(end);
                    }
                    return Promise.resolve();
                });
            };
            return sendPages();
        })
            .then(() => {
            log(`close`);
            return this.dapCmdNums(0x8B /* DAPLinkFlash.CLOSE */);
        })
            .then(res => {
            log(`daplinkclose: ${pxt.U.toHex(res)}`);
            return this.dapCmdNums(0x89 /* DAPLinkFlash.RESET */);
        })
            .then((res) => {
            log(`daplinkreset: ${pxt.U.toHex(res)}`);
            log(`full flash done`);
            pxt.tickEvent("hid.flash.full.success");
        }), timeoutMessage).catch((e) => {
            log(`error: abort`);
            pxt.tickEvent("hid.flash.full.error");
            this.flashAborted = true;
            return this.resetAndThrowAsync(e);
        });
    }
    resetAndThrowAsync(e) {
        log(`reset on error`);
        pxt.tickEvent("hid.flash.reset");
        console.debug(e);
        // reset any pending daplink
        return this.dapCmdNums(0x89 /* DAPLinkFlash.RESET */)
            .catch((e2) => {
            // Best effort reset, no-op if there's an error
        })
            .then(() => this.cortexM.reset(false))
            .catch((e2) => {
            // Best effort reset, no-op if there's an error
        })
            .then(() => {
            throw e;
        });
    }
    readUICR() {
        return this.readWords(0x10001014, 1)
            .then(v => {
            const uicr = v[0] & 0xff;
            log(`uicr: ${uicr.toString(16)} (${v[0].toString(16)})`);
            return uicr;
        });
    }
    computeFlashChecksum(resp) {
        const binFile = resp.outfiles[this.binName];
        if (!binFile)
            throw new Error(`unable to find ${this.binName} in outfiles ${Object.keys(resp.outfiles).join(', ')}`);
        return this.getFlashChecksumsAsync()
            .then(checksums => {
            log(`checksums ${pxt.Util.toHex(checksums)}`);
            // TODO this is seriously inefficient (130ms on a fast machine)
            const uf2 = ts.pxtc.UF2.newBlockFile();
            ts.pxtc.UF2.writeHex(uf2, binFile.split(/\r?\n/));
            const bytes = pxt.U.stringToUint8Array(ts.pxtc.UF2.serializeFile(uf2));
            const parsed = ts.pxtc.UF2.parseFile(bytes);
            const aligned = DAPWrapper.pageAlignBlocks(parsed, this.pageSize);
            const changed = DAPWrapper.onlyChanged(aligned, checksums, this.pageSize);
            const quick = changed.length < aligned.length / 2;
            log(`pages: ${aligned.length}, changed ${changed.length}, ${quick ? "quick" : "full"}`);
            return {
                quick,
                changed
            };
        });
    }
    quickHidFlashAsync(changed) {
        log("quick flash");
        pxt.tickEvent("hid.flash.quick.start");
        const runFlash = (b, dataAddr) => {
            const cmd = this.cortexM.prepareCommand();
            cmd.halt();
            cmd.writeCoreRegister(15 /* PC */, loadAddr + 4 + 1);
            cmd.writeCoreRegister(14 /* LR */, loadAddr + 1);
            cmd.writeCoreRegister(13 /* SP */, stackAddr);
            cmd.writeCoreRegister(0, b.targetAddr);
            cmd.writeCoreRegister(1, dataAddr);
            cmd.writeCoreRegister(2, this.pageSize >> 2);
            return Promise.resolve()
                .then(() => {
                logV("setregs");
                return cmd.go();
            })
                .then(() => {
                // starts the program
                logV(`cortex.debug.enable`);
                return this.cortexM.debug.enable();
            });
        };
        return pxt.Util.promiseTimeout(PARTIAL_FLASH_TIMEOUT, Promise.resolve()
            .then(() => this.cortexM.memory.writeBlock(loadAddr, flashPageBIN))
            .then(() => pxt.Util.promiseMapAllSeries(pxt.U.range(changed.length), i => {
            this.checkAborted();
            let b = changed[i];
            if (b.targetAddr >= 0x10000000) {
                log(`target address 0x${b.targetAddr.toString(16)} > 0x10000000`);
                return Promise.resolve();
            }
            log(`about to write at 0x${b.targetAddr.toString(16)}`);
            let writeBl = Promise.resolve();
            let thisAddr = (i & 1) ? dataAddr : dataAddr + this.pageSize;
            let nextAddr = (i & 1) ? dataAddr + this.pageSize : dataAddr;
            if (i == 0) {
                let u32data = new Uint32Array(b.data.length / 4);
                for (let i = 0; i < b.data.length; i += 4)
                    u32data[i >> 2] = pxt.HF2.read32(b.data, i);
                writeBl = this.cortexM.memory.writeBlock(thisAddr, u32data);
            }
            return writeBl
                .then(() => runFlash(b, thisAddr))
                .then(() => {
                let next = changed[i + 1];
                if (!next)
                    return Promise.resolve();
                logV("write next");
                let buf = new Uint32Array(next.data.buffer);
                return this.cortexM.memory.writeBlock(nextAddr, buf);
            })
                .then(() => {
                logV("wait");
                return this.cortexM.waitForHalt(500);
            })
                .then(() => {
                logV("done block");
            });
        }))
            .then(() => {
            log("quick flash done");
            return this.cortexM.reset(false);
        })
            .then(() => {
            pxt.tickEvent("hid.flash.quick.success");
            return this.checkStateAsync(true);
        }), timeoutMessage).catch((e) => {
            pxt.tickEvent("hid.flash.quick.error");
            this.flashAborted = true;
            return this.resetAndThrowAsync(e);
        });
    }
    getFlashChecksumsAsync() {
        log("flash checksums");
        let pages = this.numPages;
        return this.cortexM.runCode(computeChecksums2, loadAddr, loadAddr + 1, 0xffffffff, stackAddr, true, dataAddr, 0, this.pageSize, pages)
            .then(() => this.cortexM.memory.readBlock(dataAddr, pages * 2, this.pageSize));
    }
    readWords(addr, numWords) {
        return this.cortexM.memory.readBlock(addr, numWords, this.pageSize)
            // assume browser is little-endian
            .then(u8 => new Uint32Array(u8.buffer));
    }
    writeWords(addr, buf) {
        return this.cortexM.memory.writeBlock(addr, buf);
    }
    readBytes(addr, numBytes) {
        return this.cortexM.memory.readBlock(addr, (numBytes + 3) >> 2, this.pageSize)
            .then(u8 => u8.length == numBytes ? u8 : u8.slice(0, numBytes));
    }
    static onlyChanged(blocks, checksums, pageSize) {
        return blocks.filter(b => {
            let idx = b.targetAddr / pageSize;
            pxt.U.assert((idx | 0) == idx);
            pxt.U.assert(b.data.length == pageSize);
            if (idx * 8 + 8 > checksums.length)
                return true; // out of range?
            let c0 = pxt.HF2.read32(checksums, idx * 8);
            let c1 = pxt.HF2.read32(checksums, idx * 8 + 4);
            let ch = murmur3_core(b.data);
            if (c0 == ch[0] && c1 == ch[1])
                return false;
            return true;
        });
    }
    static pageAlignBlocks(blocks, pageSize) {
        pxt.U.assert(pageSize % 256 == 0);
        let res = [];
        for (let i = 0; i < blocks.length;) {
            let b0 = blocks[i];
            let newbuf = new Uint8Array(pageSize);
            for (let i = 0; i < newbuf.length; ++i)
                newbuf[i] = 0xff;
            let startPad = b0.targetAddr & (pageSize - 1);
            let newAddr = b0.targetAddr - startPad;
            for (; i < blocks.length; ++i) {
                let b = blocks[i];
                if (b.targetAddr + b.payloadSize > newAddr + pageSize)
                    break;
                pxt.U.memcpy(newbuf, b.targetAddr - newAddr, b.data, 0, b.payloadSize);
            }
            let bb = pxt.U.flatClone(b0);
            bb.data = newbuf;
            bb.targetAddr = newAddr;
            bb.payloadSize = pageSize;
            res.push(bb);
        }
        return res;
    }
    sendCustomEventAsync(type, buf) {
        if (type == "jacdac") {
            if (this.xchgAddr == null)
                return Promise.resolve();
            if (buf.length & 3) {
                const tmp = new Uint8Array((buf.length + 3) & ~3);
                tmp.set(buf);
                buf = tmp;
            }
            return new Promise(resolve => {
                this.sendQ.push({
                    buf,
                    cb: resolve
                });
            });
        }
        return Promise.reject(new Error("invalid custom event type"));
    }
    writeWord(addr, val) {
        return this.cortexM.memory.write32(addr, val);
    }
    async findJacdacXchgAddr(cid) {
        const memStart = 536870912;
        const memStop = memStart + 128 * 1024;
        const addr = (await this.readWords(memStop - 4, 1))[0];
        if (cid != this.connectionId)
            return null;
        if (memStart <= addr && addr < memStop) {
            const buf = await this.readWords(addr, 2);
            if (buf[0] == 0x786D444A && buf[1] == 0xB0A6C0E9)
                return addr;
        }
        return null;
    }
    /**
     * Sniff Jacdac exchange address
     * @returns
     */
    async initJacdac(connectionId) {
        this.xchgAddr = null;
        this.irqn = undefined;
        this.lastXchg = undefined;
        if (!this.usesCODAL) {
            log(`jacdac: CODAL disabled`);
            return;
        }
        if (this.jacdacInHex === false) {
            log(`jacdac: jacdac not compiled in`);
            return;
        }
        try {
            // allow jacdac to boot
            const now = pxt.U.now();
            await pxt.Util.delay(1000);
            let xchgRetry = 0;
            let xchg;
            while (xchg == null && xchgRetry++ < 3) {
                log(`jacdac: finding xchg address (retry ${xchgRetry})`);
                if (xchgRetry > 0)
                    await pxt.Util.delay(500); // wait for the program to start and setup memory correctly
                if (connectionId != this.connectionId)
                    return;
                xchg = await this.findJacdacXchgAddr(connectionId);
            }
            log(`jacdac: exchange address 0x${xchg ? xchg.toString(16) : "?"}; ${xchgRetry} retries; ${(pxt.U.now() - now) | 0}ms`);
            if (xchg == null) {
                log("jacdac: xchg address not found");
                this.jacdacInHex = false;
                pxt.tickEvent("hid.flash.jacdac.error.missingxchg");
                return;
            }
            if (connectionId != this.connectionId)
                return;
            const info = await this.readBytes(xchg, 16);
            if (info[12 + 2] != 0xff) {
                log("jacdac: invalid memory; try power-cycling the micro:bit");
                pxt.tickEvent("hid.flash.jacdac.error.invalidmemory");
                console.debug({ info, xchg });
                return;
            }
            // make sure connection is not outdated
            if (connectionId != this.connectionId)
                return;
            // clear initial lock
            await this.writeWord(xchg + 12, 0);
            // allow serial thread to use jacdac
            this.irqn = info[8];
            this.xchgAddr = xchg;
            log(`jacdac: exchange address 0x${this.xchgAddr.toString(16)}; irqn=${this.irqn}`);
            pxt.tickEvent("hid.flash.jacdac.connected");
        }
        catch (e) {
            if (connectionId != this.connectionId) {
                log(`jacdac: setup aborted`);
                return;
            }
            else
                throw e;
        }
    }
    async triggerIRQ() {
        const addr = 0xE000E200 + (this.irqn >> 5) * 4;
        await this.writeWord(addr, 1 << (this.irqn & 31));
    }
    async jacdacProcess() {
        const now = Date.now();
        if (this.lastXchg && now - this.lastXchg > 50) {
            logV("slow xchg: " + (now - this.lastXchg) + "ms");
        }
        this.lastXchg = now;
        let numev = 0;
        // TODO only read say 32 bytes first, and more if needed
        let inp = await this.readBytes(this.xchgAddr + 12, 256);
        if (inp[2]) {
            await this.writeWord(this.xchgAddr + 12, 0);
            await this.triggerIRQ();
            inp = inp.slice(0, inp[2] + 12);
            this.onCustomEvent("jacdac", inp);
            numev++;
        }
        let sendFree = false;
        if (this.currSend) {
            const send = await this.readBytes(this.xchgAddr + 12 + 256, 4);
            if (!send[2]) {
                this.currSend.cb();
                this.currSend = null;
                sendFree = true;
                numev++;
            }
        }
        if (!this.currSend && this.sendQ.length) {
            if (!sendFree) {
                const send = await this.readBytes(this.xchgAddr + 12 + 256, 4);
                if (!send[2])
                    sendFree = true;
            }
            if (sendFree) {
                this.currSend = this.sendQ.shift();
                const bbody = this.currSend.buf.slice(4);
                await this.writeWords(this.xchgAddr + 12 + 256 + 4, new Uint32Array(bbody.buffer));
                const bhead = this.currSend.buf.slice(0, 4);
                await this.writeWords(this.xchgAddr + 12 + 256, new Uint32Array(bhead.buffer));
                await this.triggerIRQ();
                this.lastSend = Date.now();
                numev++;
            }
            else {
                if (this.lastSend) {
                    const d = Date.now() - this.lastSend;
                    if (d > 50) {
                        this.lastSend = 0;
                        console.error("failed to send packet fast enough");
                    }
                }
            }
        }
        return numev;
    }
}
function mkDAPLinkPacketIOWrapper(io) {
    pxt.log(`packetio: mk wrapper dap wrapper`);
    return new DAPWrapper(io);
}
exports.mkDAPLinkPacketIOWrapper = mkDAPLinkPacketIOWrapper;
