'use strict';

/**
 * Module dependencies
 */

// Is this a native generator function?
const isGeneratorFunction = require("is-generator-function");
const debug = require("debug")("koa:application");
// Execute a callback when a HTTP request closes, finishes, or errors.
const onFinished = require("on-finished")
const response = require("./response")
// Compose middleware.
const compose = require("koa-compose")
const context = require("./context")
const request = require("./request")
// HTTP status utility for node.
const statuses = require("statuses")
const Emitter = require("events")
const util = require("util")
const Stream = require("stream")
const http = require("http")
// Return whitelisted properties of an object.
const only = require("only")
// It should be able to convert any legacy generator middleware to modern promise middleware ( or convert it back ).
const convert = require("koa-convert")
const deprecate = require("depd")('koa')
// Create HTTP errors for Express, Koa, Connect, etc. with ease.
const { HttpError } = require("http-errors")

/**
 * 暴露 'Application' 类.
 * 继承自 'Emitter.prototype'
 */

module.exports = class Application extends Emitter {
    /**
     * 初始化一个新的 'Application'
     * @api public
     */


    /**
     * 
     * @param {object} [options] 应用配置参数
     * @param {string} [options.env='development'] 环境
     * @param {string[]} [options.keys] 签名的 cookie keys
     * @param {boolean} [options.proxy] 信任的代理头
     * @param {number} [options.subdomainOffset] 子域偏移量
     * @param {boolean} [options.proxyIpHeader] 代理ip头, 默认为： X-Forwarded-For
     * @param {boolean} [options.maxIpsCount] 来自于代理ip头部的最大ip数，默认为0（代表无穷大）
     */
    constructor(options) {
        super();
        options = options || {};
        this.proxy = options.proxy || false;
        this.subdomainOffset = options.subdomainOffset || 2;
        this.proxyIpHeader = options.proxyIpHeader || 'X-Forwarded-For';
        this.maxIpsCount = options.maxIpsCount || 0;
        this.env = options.env || process.env.NODE_ENV || "development";
        if (options.keys) this.keys = options.keys;
        this.middleware = [];
        this.context = Object.create(context);
        this.request = Object.create(request);
        this.response = Object.create(response);
        // util.inspect.custom 为 node 6+ 提供
        // 忽略 istabnul(伊斯坦布尔)
        if (util.inspect.custom) {
            this[util.inspect.custom] = this.inspect;
        }
    }

    /**
     * 缩写: http.createServer(app.callback()).listen(...)
     * @param  {Mixed} ...
     * @return {Server}
     * @api public 
     * 
     */
    listen(...args) {
        debug('listen');
        const server = http.createServer(this.callback());
        return server.listen(...args)
    }

    /**
     * 返回 json 格式
     * 仅仅为了去展示配置项
     * @return {Object}
     * @api public
     */
    toJson() {
        return only(this, [
            'subdomainOffset',
            'proxy',
            'env'
        ])
    }

    /**
     * inspect 实现
     * @return {Object}
     * @api public
     */
    inspect() {
        return this.toJson()
    }

    /**
     * 使用给与的中间件函数
     * 老风格的中间件将被转换
     * 
     * @param {Function} fn 
     * @return {Application} self
     * @api public
     */
    use(fn) {
        if (typeof fn !== 'function') throw new TypeError("middleware must be a function!");
        if (isGeneratorFunction(fn)) {
            deprecate('Support for generators will be removed in v3.' +
                'See the decumention for examples of how to convert old middleware ' +
                'https://github.com/koajs/koa/blob/master/docs/migration.md');
            fn = convert(fn);
        }
        debug('use %s', fn._name || fn.name || "-");
        this.middleware.push(fn)
        return this;
    }


    /**
     * 返回一个请求操作的回调函数
     * node`s 原生http服务
     * 
     * @return {Function}
     * @api public
     */
    callback() {
        // 合并中间件
        const fn = compose(this.middleware);
        if (!this.listenerCount('error')) this.on('error', this.onerror);

        const handleRequest = (req, res) => {
            const ctx = this.createContext(req, res);
            return this.handleRequest(ctx, fn)
        }

        return handleRequest;
    }

    /**
     * 回调函数中操作请求
     * @param {*} ctx 
     * @param {*} fnMiddleware
     * @api private
     */
    handleRequest(ctx, fnMiddleware) {
        const res = ctx.res;
        res.statusCode = 404;
        const onerror = err => ctx.onerror(err);
        const handleResponse = () => respond(ctx);
        onFinished(res, onerror)
        return fnMiddleware(ctx).then(handleResponse).catch(onerror)
    }

    /**
     * 初始化新的上下文内容
     * @param {*} req 
     * @param {*} res 
     * @api private
     */
    createContext(req, res) {
        const context = Object.create(this.context);
        const request = context.request = Object.create(this.request);
        const response = context.response = Object.create(this.response);
        context.app = request.app = response.app = this;
        context.req = request.req = response.req = req;
        context.res = request.res = response.res = res;
        request.ctx = response.ctx = context;
        request.response = response;
        response.request = request;
        request.ctx = response.ctx = context;
        context.originalUrl = request.originalUrl = req.url;
        context.state = {};
        return context;
    }

    /**
     * 默认错误操作
     * @param {Error} err 
     * @api private
     */
    onerror(err) {
        const isNativeError = Object.prototype.toString.call(err) == "[object Error]" || err instanceof Error;
        if (!isNativeError) throw new TypeError(util.format('non-error thrown: %j', err));

        if (404 == err.staus || err.expose) return;
        if (this.silent) return;

        const msg = err.stack || err.toString()
        console.error(`\n${msg.replace(/^/gm, ' ')}\n`)
    }

    static get default() {
        return Application;
    }
};

function respond(ctx) {
    // allow bypassing koa
    if (false == ctx.respond) return;

    if (!ctx.writable) return;

    const res = ctx.res;
    let body = ctx.body;
    const code = ctx.status;

    // ignore body
    if (statuses.empty[code]) {
        ctx.body = null;
        return res.end()
    }

    if ('HEAD' === ctx.method) {
        if (!res.headersSent && !ctx.response.has('Content-length')) {
            const { length } = ctx.response;
            if (Number.isInteger(length)) ctx.length = length;
        }
        return res.end();
    }

    // status body
    if (null == body) {
        if (ctx.response._explicitNullBody) {
            ctx.response.remove('Content-Type');
            ctx.response.remove("Transfer-Encoding");
            return res.end();
        }
        if (ctx.req.httpVersionMajor >= 2) {
            body = String(code)
        } else {
            body = ctx.message || String(code);
        }
        if (!res.headersSent) {
            ctx.type = "text"
            ctx.length = Buffer.byteLength(body)
        }
        return res.end(body)
    }

    // responses
    if (Buffer.isBuffer(body)) return res.end(body);
    if ('string' === typeof body) return res.end(body);
    if (body instanceof Stream) return body.pipe(res);

    body = JSON.stringify(body);
    if (!res.headersSent) {
        ctx.length = Buffer.byteLength(body)
    }
    res.end(body)
}


module.exports.HttpError = HttpError;