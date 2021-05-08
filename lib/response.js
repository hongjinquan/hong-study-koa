/*
 * @Description: 
 * @Author: hongjinquan
 * @Date: 2021-05-08 14:21:28
 */
'use strict'

/**
 * 模块依赖
 */

const contentDisposition = require('content-disposition');
const getType = require('cache-content-type');
const onFinish = require('on-finished');
const escape = require('escape-html');
const typeis = require('type-is').is;
const statuses = require('statuses');
const destroy = require('destroy');
const assert = require('assert');
const extname = require('path').extname;
const vary = require('vary');
const only = require('only');
const util = require('util');
const encodeUrl = require('encodeurl');
const Stream = require('stream');
const { origin } = require('./request');

/**
 * 属性
 */
module.exports = {
    get socket() {
        return this.res.socket;
    },

    get header() {
        const { res } = this;
        return typeof res.getHeaders === 'function' ? res.getHeaders() : res._headers || {};
    },

    get headers() {
        return this.header;
    },

    get status() {
        return this.res.statusCode;
    },
    set status(code) {
        if (this.headerSent) return;
        assert(Number.isInteger(code), 'status code must be a number');
        assert(code >= 10 && code <= 999, `invalid status code:${code}`);

        this._explicitStatus = true;
        this.res.statusCode = code;
        if (this.req.httpVersionMajor < 2) this.res.statusMessage = statuses[code];
        if (this.body && statuses.empty[code]) this.body = null;
    },
    get message() {
        return this.res.statusMessage || statuses[this.status]
    },
    set message(msg) {
        this.res.statusMessage = msg;
    },

    get body() {
        return this._body;
    },
    set body(val) {
        const original = this._body;
        this._body = val;

        if (null == val) {
            if (!statuses.empty[this.status]) this.status = 204;
            if (val === null) this._exlicitNullBody = true;
            this.remove('Content-Type');
            this.remove('Content-Length');
            this.remove('Transfer-Encoding');
            return;
        }

        if (!this._explicitStatus) this.status = 200;

        const setType = !this.has('Content-Type');

        if ('string' === typeof val) {
            if (setType) this.type = /^\s*</.test(val) ? 'html' : 'text';
            this.length = Buffer.byteLength(val);
            return;
        }

        if (Buffer.isBuffer(val)) {
            if (setType) this.type = 'bin';
            this.length = val.length;
            return;
        }

        if (val instanceof Stream) {
            onFinish(this.res, destroy.bind(null, val));
            if (original != val) {
                val.once('error', err => this.ctx.onerror(err));
                if (null != original) this.remove('Content-Length');
            }

            if (setType) this.type = 'bin';
            return;
        }

        this.remove('Content-Length');
        this.type = 'json';
    },

    set length(n) {
        this.set('Content-Length', n);
    },

    get length() {
        if (this.has('Content-Length')) {
            return parseInt(this.get('Content-Length'), 10) || 0;
        }

        const { body } = this;
        if (!body || body instanceof Stream) return undefined;
        if ('string' === typeof body) return Buffer.byteLength(body);
        if (Buffer.isBuffer(body)) return body.length;
        return Buffer.byteLength(JSON.stringify(body));
    },

    get headerSent() {
        return this.res.headersSent;
    },

    vary(field) {
        if (this.headerSent) return;
        vary(this.res, field);
    },

    redirect(url, alt) {
        if ('back' === url) url = this.ctx.get('Referrer') || alt || '/';
        this.set('Location', encodeUrl(url));

        if (!statuses.redirect[this.status]) this.status = 302;

        if (this.ctx.accepts('html')) {
            url = escape(url);
            this.type = 'text/html; charset=utf-8';
            this.body = `Redirecting to <a href="${url}">${url}</a>.`;
            return;
        }

        this.type = 'text/plain; charset=utf-8';
        this.body = `Redirecting to ${url}`
    },

    attachment(filename, options) {
        if (filename) this.type = extname(filename);
        this.set('Content-Disposition', contentDisposition(filename, options));
    },

    set type(type) {
        type = getType(type);
        if (type) {
            this.set('Content-Type', type);
        } else {
            this.remove('Content-Type');
        }
    },
    get type() {
        const type = this.get('Content-Type');
        if (!type) return '';
        return type.split(';', 1)[0];
    },

    set lastModified(val) {
        if ('string' === typeof val) val = new Date(val);
        this.set('Last-Modified', val.toUTCString());
    },

    get lastModified() {
        const date = this.get('last-modified');
        if (date) return new Date(date);
    },

    set etag(val) {
        if (!/^(W\/)?"/.test(val)) val = `"${val}"`;
        this.set('ETag', val);
    },
    get etag() {
        return this.get('ETag');
    },

    is(type, ...types) {
        return typeis(this.type, type, ...types);
    },

    get(field) {
        return this.header[field.toLowerCase()] || '';
    },
    set(field, val) {
        if (this.headerSent) return;

        if (2 === arguments.length) {
            if (Array.isArray(val)) val = val.map(v => typeof v === 'string' ? v : String(v));
            else if (typeof val !== 'string') val = String(val);
            this.res.setHeader(field, val);
        } else {
            for (const key in field) {
                this.set(key, field[key]);
            }
        }
    },

    has(field) {
        return typeof this.res.hasHeader === 'function'
            ? this.res.hasHeader(field)
            // Node < 7.7
            : field.toLowerCase() in this.headers;
    },

    append(field, val) {
        const prev = this.get(field);

        if (prev) {
            val = Array.isArray(prev)
                ? prev.concat(val)
                : [prev].concat(val);
        }

        return this.set(field, val);
    },

    remove(field) {
        if (this.headerSent) return;

        this.res.removeHeader(field);
    },

    get writable() {
        // 不能响应任何内容当响应结束后
        // 从 Node > 12.9 后，可用 response.writableEnded 判断；文档：https://nodejs.org/api/http.html#http_response_writableended
        // response.finished 是非正式的特性，在之前的node 版本中； 文档：https://stackoverflow.com/questions/16254385/undocumented-response-finished-in-node-js
        if (this.res.writableEnded || this.res.finished) return false;

        const socket = this.res.socket;
        // There are already pending outgoing res, but still writable
        // 早已经处于pending状态的响应，还可以继续执行写操作
        // https://github.com/nodejs/node/blob/v4.4.7/lib/_http_server.js#L486

        if (!socket) return true;
        return socket.writable;
    },
    inspect() {
        if (!this.res) return;
        const o = this.toJSON();
        o.body = this.body;
        return o;
    },
    toJSON() {
        return only(this, [
            'status',
            'message',
            'header'
        ]);
    },
    flushHeaders() {
        this.res.flushHeaders();
    }
};

if (util.inspect.custom) {
    module.exports[util.inspect.custom] = module.exports.inspect;
}