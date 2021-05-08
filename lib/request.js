/*
 * @Description: koa-request
 * @Author: hongjinquan
 * @Date: 2021-05-08 14:21:28
 */
'use strict'

/**
 * 模块依赖
 */
const URL = require('url').URL;
const net = require('net');
const accepts = require('accepts')
const contentType = require('content-type');
const stringify = require('url').format;
const parse = require('parseurl');
const qs = require('querystring');
const typeis = require('type-is');
const fresh = require('fresh');
const only = require('only');
const util = require('util');

const IP = Symbol('context#ip')

/**
 * 属性
 */

module.exports = {
    get header() {
        return this.req.header;
    },
    set header(val) {
        this.req.header = val;
    },
    get headers() {
        return this.req.headers;
    },
    set headers(val) {
        this.req.headers = val;
    },
    get url() {
        return this.req.url;
    },
    set url(val) {
        this.req.url = val;
    },
    get origin() {
        return `${this.protocol}://${this.host}`;
    },
    get href() {
        if (/^https?:\/\//i.test(this.originalUrl)) {
            return this.originalUrl;
        }
        return this.origin + this.originalUrl;
    },
    get method() {
        return this.req.method;
    },
    set method(val) {
        this.req.method = val;
    },

    get path() {
        return parse(this.req).pathname;
    },
    set path(path) {
        const url = parse(this.req);
        if (url.pathname === path) {
            return;
        }
        url.pathname = path;
        url.path = null;

        this.url = stringify(url)
    },

    get query() {
        const str = this.querystring;
        const c = this._querycache = this._querycache || {};
        return c[str] || (c[str] = qs.parse(str));
    },
    set query(obj) {
        this.querystring = qs.stringify(obj);
    },

    get querystring() {
        if (!this.req) return '';
        return parse(this.req).query || '';
    },
    set querystring(str) {
        const url = parse(this.req);
        if (url.search === `?${str}`) {
            return;
        }
        url.search = str;
        url.path = null;

        this.url = stringify(url);
    },

    get search() {
        if (!this.querystring) return '';
        return `${this.querystring}`;
    },
    set search(str) {
        this.querystring = str;
    },

    get host() {
        const proxy = this.app.proxy;
        let host = proxy && this.get('X-Forwarded-Host');
        if (!host) {
            if (this.req.httpVersionMajor >= 2) host = this.get(':authority');
            if (!host) host = this.get('Host');
        }
        if (!host) {
            return '';
        }
        return host.split(/\s*,\s*/, 1)[0];
    },

    get hostname() {
        const host = this.host;
        if (!host) {
            return '';
        }
        if ('[' === host[0]) return this.URL.hostname || ''; // IPV6
        return host.split(':', 1)[0];
    },

    get URL() {
        if (!this.memoizedURL) {
            const originalUrl = this.originalUrl || '';
            try {
                this.memoizedURL = new URL(`${this.origin}${originalUrl}`)
            } catch (error) {
                this.memoizedURL = Object.create(null)
            }
        }
        return this.memoizedURL;
    },

    get fresh() {

        const method = this.method();
        const s = this.ctx.status;

        if ('GET' !== method && 'HEAD' !== method) return false;

        // 只有get和head请求可以进行刷新操作
        if ((s >= 200 && s < 300) || 304 === s) {
            return fresh(this.header, this.response.header);
        }
        return false;
    },

    get statle() {
        return !this.fresh;
    },

    get idempotent() {
        const methods = ['GET', 'HEAD', 'PUT', 'DELETE', 'OPTIONS', 'TRACE'];
        // ~ 为 位非， 1、将数字转为二进制源码；2、全部取反；3、32有符号整数，高位代表符号，其余位数取反；4、加1
        // 实际：对数字【取负值】然后 【减一】
        return !!~methods.indexOf(this.method);
    },

    get socket() {
        return this.req.socket;
    },

    get charset() {
        try {
            const { parameters } = contentType.parse(this.req);
            return parameters.charset || '';
        } catch (error) {
            return '';
        }
    },

    get length() {
        const len = this.get('Content-Length');
        if (len === '') return;
        return ~~len;
    },

    get protocol() {
        if (this.socket.encrypted) return 'https';
        if (!this.app.proxy) return 'http';
        const proto = this.get('X-Forwarded-Proto')
        return proto ? proto.split(/\s*,\s*/, 1)[0] : 'http';
    },

    get secure() {
        return 'https' === this.protocol;
    },

    get ips() {
        const proxy = this.app.proxy;
        const val = this.get(this.app.proxyIpHeader);
        let ips = proxy && val ? val.split(/\s*,\s*/) : [];
        if (this.app.maxIpsCount > 0) {
            ips = ips.slice(-this.app.maxIpsCount);
        }
        return ips;
    },

    get ip() {
        if (!this[IP]) {
            this[IP] = this.ips[0] || this.socket.remoteAddress || '';
        }
        return this[IP];
    },
    set ip(_ip) {
        this[IP] = _ip;
    },

    get subdomains() {
        const offset = this.app.subdomainOffset;
        const hostname = this.hostname;
        if (net.isIP(hostname)) return [];
        return hostname.split('.').reverse().slice(offset);
    },

    get accept() {
        return this._accept || (this._accept = accepts(this.req))
    },
    set accept(obj) {
        this._accept = obj;
    },

    accepts(...args) {
        return this.accept.types(...args)
    },

    acceptsEncodings(...args) {
        return this.accept.encodings(...args)
    },

    acceptsCharsets(...args) {
        return this.accept.charsets(...args);
    },

    acceptsLanguages(...args) {
        return this.accept.languages(...args);
    },

    is(type, ...types) {
        return typeis(this.req, type, ...types);
    },

    get type() {
        const type = this.get('Content-Type');
        if (!type) return '';
        return type.split(';')[0];
    },

    get(field) {
        const req = this.req;
        switch (field = field.toLowerCase()) {
            case 'referer':
            case 'referrer':
                return req.headers.referrer || req.headers.referer || '';
            default:
                return req.headers[field] || '';
        }
    },

    inspect() {
        if (!this.req) return;
        return this.toJSON();
    },

    toJSON() {
        return only(this, [
            'method',
            'url',
            'header'
        ]);
    }
};

if (util.inspect.custom) {
    module.exports[util.inspect.custom] = module.exports.inspect;
}