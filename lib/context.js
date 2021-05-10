'use strict';
/*
 * @Description: koa-context
 * @Author: hongjinquan
 * @Date: 2021-05-08 14:21:28
 */

/**
 * 模块依赖
 */

const util = require('util')
const createError = require('http-errors')
const httpAssert = require('http-assert')
const delegate = require('delegates');
const statuses = require('statuses')
const Cookies = require('cookies');

const COOKIES = Symbol('context#cookies')

/**
 * 上下文 属性
 */

const proto = module.exports = {
    /**
     * util.inspect() 使用, 仅仅返回 json 结果。
     * @api public
     */
    inspect() {
        if (this === proto) {
            return this
        }
        return this.toJson();
    },

    /**
     * 返回json格式
     * 
     * 这边我们显式地对每一个对象实现了 .toJson() 方法
     * 要不然迭代时将会失败，可能因 getters 导致
     * 并会导致程序 clone() 失败
     *
     * @returns {Object}
     * @api public
     */
    toJson() {
        return {
            request: this.request.toJson(),
            reponse: this.request.toJson(),
            app: this.app.toJson(),
            originalUrl: this.originalUrl,
            req: '<original node req>',
            res: '<original node res>',
            socker: '<original node socket>'
        }
    },

    /**
     * 跟 .throw()类似，添加了断言
     * eg: this.assert(this.user, 401, 'Please login')
     * @params {Mixed} test
     * @params {Number} status
     * @params {String} message
     * @api public
     */
    assert: httpAssert,

    /**
     * 抛出带有 状态码 和 错误信息 的错误
     * 注意：这些错误存在用户级别的错误并且这些信息对于客户端是不显示的
     * 注意：状态码 应该被放置到第一个参数中
     * @param  {String|Number|Error} err, msg or status
     * @param  {String|Number|Error} [err,msg or status]
     * @param  {Object} [props]
     * @api public
     */
    throw(...args) {
        throw createError(...args);
    },

    /**
     * 错误监听操作
     * @param {Error} err 
     * @api private
     */
    onerror(err) {
        // 没有错误不去做任何事情
        if (null == err) {
            return;
        }
        // 判断当前错误是否为原生的错误
        const isNativeError = Object.prototype.toString.call(err) === '[Object Error]' || err instanceof Error;
        if (!isNativeError) {
            // 不为原生错误，则 实例化一个 Error，并赋值。
            err = new Error(util.format('non-error thrown: %j', err));
        }

        let headerSent = false;
        // 头部发送 或者 不存在可写流
        if (this.headerSent || !this.writable) {
            headerSent = err.headerSent = true;
        }

        this.app.emit('error', err, this);

        if (headerSent) {
            // 头发发送的话，直接返回
            return;
        }

        const { res } = this;

        if (typeof res.getHeaderNames === 'function') {
            // 移出头部内容
            res.getHeaderNames.forEach(name => res.removeHeader(name))
        } else {
            // 兼容 node7.7 以下版本
            res._headers = {};
        }

        this.set(err.headers);

        // 强制为 text/plain 格式传递
        this.type = 'text';

        let statusCode = err.status || err.statusCode;

        // ENOENT 错误码 支持
        if ('ENOENT' === err.code) {
            statusCode = 404;
        }

        // 设置默认值为 500
        if ('number' !== typeof statusCode || !statuses[statusCode]) { statusCode = 500; }

        // 响应
        const code = statuses[statusCode];
        const msg = err.expose ? err.message : code;
        this.status = err.status = statusCode;
        this.length = Buffer.byteLength(msg);
        res.end(msg);
    },

    get cookies() {
        if (!this[COOKIES]) {
            this[COOKIES] = new Cookies(this.req, this.res, {
                keys: this.app.keys,
                secure: this.request.secure
            });
        }
        return this[COOKIES]
    },

    set cookies(_cookies) {
        this[COOKIES] = _cookies;
    }
};

/**
 * 为了新的node版本使用 自定义检查函数
 * @return {Object}
 * @api public
 */
if (util.inspect.custom) {
    module.exports[util.inspect.custom] = module.exports.inspect;
}

/**
 * 响应委托
 */
delegate(proto, 'response')
    .method('attachment')
    .method('redirect')
    .method('remove')
    .method('vary')
    .method('has')
    .method('set')
    .method('append')
    .method('flushHeaders')
    .access('status')
    .access('message')
    .access('body')
    .access('length')
    .access('tyoe')
    .access('lastModified')
    .access('etag')
    .getter('headerSent')
    .getter('writable');

/**
 * 请求委托
 */
delegate(proto, 'request')
    .method('acceptsLanguages')
    .method('acceptsEncodings')
    .method('acceptsCharsets')
    .method('accepts')
    .method('get')
    .method('is')
    .access('querystring')
    .access('idempotent')
    .access('socket')
    .access('search')
    .access('method')
    .access('method')
    .access('query')
    .access('path')
    .access('url')
    .access('accept')
    .getter('origin')
    .getter('href')
    .getter('subdomains')
    .getter('protocol')
    .getter('host')
    .getter('hostname')
    .getter('URL')
    .getter('header')
    .getter('headers')
    .getter('secure')
    .getter('stale')
    .getter('fresh')
    .getter('ips')
    .getter('ip')