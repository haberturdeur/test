importScripts("/test/pxtworker.js");let pm=postMessage;"undefined"==typeof btoa&&(ts.pxtc.encodeBase64=function(e){function r(e){return e<=25?e+65:e<=51?e+71:e<=61?e-4:62==e?43:47}let t=new Array,o=0,n=0;for(let i=0;i<e.length;i++){let a=e.charCodeAt(i);if(a>255)return;0==o?(t.push(String.fromCharCode(r(a>>2))),o=1,n=(3&a)<<4):1==o?(t.push(String.fromCharCode(r(n|a>>4))),o=2,n=(15&a)<<2):2==o&&(t.push(String.fromCharCode(r(n|a>>6),r(63&a))),o=0,n=0)}return 1==o?t.push(String.fromCharCode(r(n),61,61)):2==o&&t.push(String.fromCharCode(r(n),61)),t.join("")}),"undefined"==typeof atob&&(ts.pxtc.decodeBase64=function(e){function r(e){return 47==e?63:43==e?62:e<=57?e+4:e<=90?e-65:e-71}function t(e,r,t){let o=0;for(let t=0;t<=e-r;t++)o=1+(o<<1);return t>>r&o}let o=new Array,n=!0,i=!1,a=!1,p=!1,l=!1,y=!1,s=0,u=new RegExp("^([A-Za-z0-9+/=])$");for(let f=0;f<e.length;f++){let c=e.charCodeAt(f);if(!String.fromCharCode(c).match(u)||61==c&&(n||i)||61==c&&0!=s||61!=c&&l||y)return;n?(s=r(c)<<2,n=!1,i=!0,a=!1,p=!1,l=!1,y=!1):i?(o.push(String.fromCharCode(s|t(5,4,r(c)))),s=(15&r(c))<<4,n=!1,i=!1,a=!0,p=!1,l=!1,y=!1):a?61==c?(s=0,n=!1,i=!1,a=!1,p=!1,l=!0,y=!1):(o.push(String.fromCharCode(s|t(5,2,r(c)))),s=(3&r(c))<<6,n=!1,i=!1,a=!1,p=!0,l=!1,y=!1):p?61==c?(s=0,n=!1,i=!1,a=!1,p=!1,l=!1,y=!0):(o.push(String.fromCharCode(s|r(c))),s=0,n=!0,i=!1,a=!1,p=!1,l=!1,y=!1):l&&(s=0,n=!1,i=!1,a=!1,p=!1,l=!1,y=!0)}if(!n&&!y)return;return o.join("")}),String.prototype.startsWith||Object.defineProperty(String.prototype,"startsWith",{value:function(e,r){return void 0!==e&&null!=e&&(r=!r||r<0?0:+r,this.substring(r,r+e.length)===e)}}),Uint8Array.prototype.slice||Object.defineProperty(Uint8Array.prototype,"slice",{value:Array.prototype.slice,writable:!0,enumerable:!0}),Uint16Array.prototype.slice||Object.defineProperty(Uint16Array.prototype,"slice",{value:Array.prototype.slice,writable:!0,enumerable:!0}),Uint32Array.prototype.slice||Object.defineProperty(Uint32Array.prototype,"slice",{value:Array.prototype.slice,writable:!0,enumerable:!0}),Uint8Array.prototype.some||Object.defineProperty(Uint8Array.prototype,"some",{value:Array.prototype.some,writable:!0,enumerable:!0}),Uint16Array.prototype.some||Object.defineProperty(Uint16Array.prototype,"some",{value:Array.prototype.some,writable:!0,enumerable:!0}),Uint32Array.prototype.some||Object.defineProperty(Uint32Array.prototype,"some",{value:Array.prototype.some,writable:!0,enumerable:!0}),Uint8Array.prototype.reverse||Object.defineProperty(Uint8Array.prototype,"reverse",{value:Array.prototype.reverse,writable:!0,enumerable:!0}),Uint16Array.prototype.reverse||Object.defineProperty(Uint16Array.prototype,"reverse",{value:Array.prototype.reverse,writable:!0,enumerable:!0}),Uint32Array.prototype.reverse||Object.defineProperty(Uint32Array.prototype,"reverse",{value:Array.prototype.reverse,writable:!0,enumerable:!0}),Uint8Array.prototype.fill||Object.defineProperty(Uint8Array.prototype,"fill",{writable:!0,enumerable:!0,value:function(e){if(null==this)throw new TypeError("this is null or not defined");let r=Object(this),t=r.length>>>0,o=arguments[1],n=o>>0,i=n<0?Math.max(t+n,0):Math.min(n,t),a=arguments[2],p=void 0===a?t:a>>0,l=p<0?Math.max(t+p,0):Math.min(p,t);for(;i<l;)r[i]=e,i++;return r}}),Array.prototype.find||Object.defineProperty(Array.prototype,"find",{writable:!0,enumerable:!0,value:function(e){if(null==this)throw new TypeError('"this" is null or not defined');let r=Object(this);const t=r.length>>>0;if("function"!=typeof e)throw new TypeError("predicate must be a function");const o=arguments[1];let n=0;for(;n<t;){const t=r[n];if(e.call(o,t,n,r))return t;n++}}}),Math.imul||(Math.imul=function(e,r){const t=65535&e,o=65535&r;return t*o+((e>>>16&65535)*o+t*(r>>>16&65535)<<16>>>0)|0}),"function"!=typeof Object.assign&&Object.defineProperty(Object,"assign",{value:function(e,r){"use strict";if(null==e)throw new TypeError("Cannot convert undefined or null to object");let t=Object(e);for(let e=1;e<arguments.length;e++){let r=arguments[e];if(null!=r)for(let e in r)Object.prototype.hasOwnProperty.call(r,e)&&(t[e]=r[e])}return t},writable:!0,configurable:!0}),Promise.prototype.finally||(Promise.prototype.finally=Promise.prototype.finally||{finally(e){const r=r=>Promise.resolve(e()).then(r);return this.then((e=>r((()=>e))),(e=>r((()=>Promise.reject(e)))))}}.finally),onmessage=e=>{let r=pxtc.service.performOperation(e.data.op,e.data.arg);pm({op:e.data.op,id:e.data.id,result:JSON.parse(JSON.stringify(r))})},pm({id:"ready"});