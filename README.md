## hong-study-koa
关于koa源码的学习项目
## 如何进行测试
1. 新建一个目录 mkdir testProject;
2. 执行 npm init，然后一路回车；
3. 在package.json中添加依赖包 
  "dependencies": {
    "hong-study-koa": "^1.0.0"
  }
4. 根目录下新建node_modules目录，然后将此项目代码整体放入；
5. 项目根目录下，新建文件 app.js，具体内容如下：
```
  const Koa = require("hong-study-koa")
  const app = new Koa();

  app.use(async ctx => {
      console.log("进来了");
      ctx.body = "hello world handy.";
      console.log("ctx.body");
  })

  app.listen(3000)
  console.log("监听3000")
```
6. 启动app.js，执行：node app.js;
7. 浏览器访问：localhost:3000，即可看到内容。
