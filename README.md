# React+Node大文件分片上传、断点续传、秒传(封装组件)
## Upload组件 src/components/Upload

# 虚拟列表
## VirtualList组件 src/components/VirtualList

# 单点登录、权限控制（已了解基本内容 不做实现）
## 一些概念
一、sso(single sign-on) 单点登录
  1、sso是一种身份验证方法,允许用户通过身份提供商进行一次身份验证即可访问多个应用程序。它的核心目标是减少用户在不同系统之间重复输入账号和密码的繁琐操作,提高用户体验和工作效率。
  2、sso是目前比较流行的企业业务整合的解决方案之一
  3、sso的三种实现方案：
    session+cookie
      流程：
        1）在认证中心登录,认证中心记录一个session存储在数据库,并返回一个sid以cookie形式存储在客户端
        2）访问子系统发送请求时自动携带cookie信息,向用户中心验证sid是否存在
        3）存在,返回受保护的用户信息
        4）不存在,重定向到认证中心登录页,引导用户重新登录
      优点：服务器有超强的用户控制能力,比如让某个用户下线,删除数据库中的sid即可
      缺点：
        这种模式随着用户量不断增大,就需要不断扩容,子系统增加,认证中心也要扩容,对于小企业而言压力非常大；
        这种模式对于认证中心安全防护和容灾要求非常高,一旦认证中心挂掉,所有子系统都无法验证登录态；
        每次用户访问子系统都要到认证中心去验证,认证中心服务器压力非常大；
    token
      流程：
        1）到认证中心登录,认证中心会返回一个token,供客户端自动存储,此时认证中心不存取任何信息（这个token一般是JWT生成的数字签名,一个不可篡改的字符串,这个token有过期时间）
        2）后续访问子系统请求中都会携带这个token,子系统可以验证这个token,不需要到认证中心去验证
        3）子系统验证成功,返回受保护的信息
        4）子系统验证失败,重新到认证中心登录
      优点：认证中心压力减小,每个用户访问子系统子系统可以自行验证用户身份,不需要向认证中心发送请求,因此,子系统扩容与认证中心无关。所以token模式是一种分布式的认证机制,每个子系统自行去认证。
      缺点：很难进行集中控制。由于每个子系统自行验证用户身份,那么想让某个用户彻底下线需要每个子系统自行去拦截该用户,加入黑名单,很麻烦。在这种情况下,想让认证中心有一定的控制能力,就产生了双token模式。
    token_refreshtoken
      流程：
        1）到认证中心登录,拿到两个token,第一个是正常的token,过期时间较短,一般是半个小时。另一个是refresh token,过期时间较长,一般是一个星期。
        2）访问子系统时会携带token去验证,token过期则失败。
        3）token失效后,携带refresh token到认证中心,认证中心校验这个refresh token有效,则换取新的token。refresh token过期,则重新登录。
        4）得到新的token后到子系统去验证
      总结：这里采用双token模式,不需要像session+cookie模式一样每次访问子系统都向认证中心发送请求,也不用在数据库中存储用户信息,减小了认证中心服务区压力。也不像token模式一样认证中心丧失了对用户的控制,如果想让一个用户下线,在token过期后,认证中心不返回新的token,则实现了用户强制下线。
  4、补充JWT(JSON Web Token)
    定义：JWT本质上就是一个字符串,只不过这个字符串是通过特殊方法进行过加密处理的。
    用户登录产生的问题：针对用户登录问题而言,浏览器请求服务器时会返回一个用户标识给浏览器,保证下次访问时可以凭借该标识验证用户是否已登录。但是由于客户端通过cookie或者localStorage存储信息是极其容易被伪造的,所以服务器无法信任浏览器。采用cookie+session方式可以解决这个问题,但是对服务器存储有很大压力,而且频繁访问,对服务器本身压力也很大。就采用JWT方案来解决这个问题。
    JWT在用户登录场景的使用：对服务器返回的信息+密钥通过一个算法生成一个签名,将这个签名和信息一起返回给浏览器,下次浏览器请求的时候就会带这个信息到服务器,服务器取出这个信息用相同的密钥生成新的签名与浏览器的签名进行对比验证。这个签名里面暗含了原始信息info和服务器密钥,只要这两个内容不变,就可以防止伪造。因此有了JWT之后就可以不再使用session模式了,不需要再去开辟任何的存储空间。
    常用的信息组合格式：header+payload=signature
    header: 是一个json格式的对象,里面记录了签名算法,和标记了整个字符串的类型是JWT,经过base64转码成一个字符串
    payload: 主体内容（身份信息等）,经过base64转码成一个字符串
    signature: 将前面两个内容加起来,给一个密钥,使用相应的加密算法得到一个签名结果,再将这个签名结果经过base64转码得到一个signature
  5、token有过期时间,应该是将过期时间放在请求头中,子系统验证时发现过期时间小于当前服务器时间就让重新登录,若大于,则将用户信息用固定的加密算法和密钥进行加密再转码与请求携带的token进行对比,就可以安全地校验用户是否已登录。
二、OAuth(open authorization) 开放授权
  是一种授权协议,它允许用户授权第三方应用访问他们在某一服务提供商处的某些特定资源,而无需将自己的账号和密码提供给第三方应用。

# 提高首屏渲染速度
## 思路
### js加载角度
1、script标签:defer、async、module
  1）async模式下，script标签的加载是异步的，js不会阻塞dom的渲染，async加载是无顺序的，当文件加载结束，js会立即执行。因此,js文件的加载不会阻塞dom渲染，但js文件执行会阻塞dom渲染。若js资源与dom元素没有依赖关系，也不会产生其他资源所需要的数据时，可以使用async模式，比如埋点统计。
  2）defer模式下，js加载是异步的，defer资源会在html解析完成之后、DomContentLoaded触发之前执行。此时，html文档已完全解析，dom结构已构建完成，适合依赖dom的脚本。如果多个标签存在，会按照引入的先后顺序执行，即便后面的script资源先返回。
  // <script defer src=""><script>
  3）module模式,在主流的现代浏览器中，script标签的属性可以加上type="module"，浏览器会对其内部的import引用发起http请求，获取模块内容。这时，script的行为会像defer一样，在后台下载，并且等待dom解析。
  // <scritp type="module">import { a } from './a.js'<script>
2、link标签：rel属性(preload、prefetch)
  1）link标签的preload属性，用于提前加载一些需要的依赖，这些资源会优先加载。
  preload特点：
    preload加载的资源是在浏览器渲染机制之前处理的，并且不会阻塞onload事件
    preload加载的js脚本其加载和执行的过程是分离的，即preload会预加载相应的脚本代码，待到需要时自行调用。
  // <link href="" rel="preload />
  2）prefetch是利用浏览器的空闲时间，加载页面将来可能用到的资源的一种机制。通常可以用来加载其他页面（非首页）所需要的资源，以便加快后续页面的打开速度。
  prefetch特点：
    prefetch加载的资源可以获取非当前页面所需要的资源，并将其放入缓存至少五分钟（无论资源是否可以缓存）
    当页面跳转时，未完成的prefetch请求不会被中断
### 多媒体资源角度
压缩、动态剪裁、base64
### webpack打包角度
1、配合路由懒加载的页面分包
  调用import()的地方被视为分离的模块起点，被请求的模块和它引用的所有子模块会分离到一个单独的chunk中
  webpackChunkName作用是webpack在打包时对异步引入的库代码进行代码分割时，设置代码块的名字。webpack会将任何一个异步模块与相同的块名称组合到相同的异步块中。
2、配合组件懒加载的组件分包
3、合理使用tree shake
  原理：依赖于es6的模块特性，es6模块依赖关系是确定的，和运行时状态无关，可以进行可靠的静态分析，这就是tree-shaking的基础
  静态分析就是不需要执行代码，就可以从字面量上对代码进行分析。es6之前的模块化，比如commonjs是动态加载，只有执行后才知道引用什么模块，就不可能通过静态分析去做优化，正是基于这个才是tree shaking成为可能
4、代码压缩
### 路由懒加载角度
路由懒加载原理：ES6动态地加载模块 import()
Suspense和React.lazy()配合使用
配置路由懒加载后,打开哪个路由对应的页面就加载哪个页面的资源,不必再加载整个项目的全部资源
### 组件懒加载
和路由懒加载相同,采用import()的方式进行异步加载
有时资源拆分得过细也不合理,可能会造成浏览器http请求的增多
适合组件懒加载的场景：
1、该页面的js文件体积大,导致页面打开慢，可以通过组件懒加载进行资源拆分,利用浏览器并行下载资源，提升下载速度(比如首页)
2、该组件不是一进入页面就展示，需要一定条件才触发(比如弹框组件)
3、该组件复用性高，很多页面都有引入，利用组件懒加载抽离出该组件，一方面可以很好地利用缓存，同时可以减少页面的js文件大小(比如表格组件、图形组件等)
### 异步请求角度
### 一些分情况的处理方案
#### 时间分片
#### 虚拟列表
#### 图片懒加载
#### 骨架屏
原理：spa单页面最初的html都是空白的，需要通过加载js将内容挂载到根结点上，这可能会造成长时间的白屏。骨架屏的原理是在项目打包时将骨架屏的内容直接放到html文件的根节点上。
#### 使用web worker运行耗时任务
由于浏览器GUI渲染线程与JS引擎线程是互斥关系，当页面中有很多长任务时，会造成页面UI阻塞，出现页面卡顿、掉帧等情况。
执行时间超过50ms的任务为长任务
web worker的通信时长：浏览器加载worker.js的时长
当任务的运行时间 - 通信时长 > 50ms时，推荐使用web worker
#### requestAnimationFrame制作动画
requestAnimationFrame是浏览器专门为动画提供的API，它的刷新频率与显示器的频率保持一致，使用该api可以解决setTimeout/setInterval制作动画卡顿的情况
setTimeout/setInterval、requestAnimationFrame三者的区别：
1、引擎层面：
  setTimeout/setInterval属于js引擎，requestAnimationFrame属于GUI引擎
  js引擎与GUI引擎是互斥的，也就是说GUI引擎在渲染时会阻塞js引擎的计算
2、时间是否准确：
  requestAnimationFrame刷新频率是固定且准确的，但setTimeout/setInterval是宏任务，根据浏览器的事件轮询机制,其他任务会阻塞或延迟js任务的执行，会出现定时器不准的情况。
3、性能层面：
  当页面被隐藏或最小化时，setTimeout/setInterval定时器仍会在后台执行动画任务，而使用requestAnimationFrame当页面处于未激活的状态下，屏幕刷新任务会被系统暂停。
### CDN：减少客户端到服务器之间的物理链路长度，提升传输效率
### http缓存优化(强缓存、协商缓存)、外置依赖(webpack external)、scope hoisting、performance监控产物体积（cra好像有自己的策略）
## 文章 https://juejin.cn/post/7188894691356573754?searchId=20250819160644723EEE3E547966124A64#heading-13

# 前端页面、组件性能监控、埋点上报、数据分析
## 思路
接入sentry
webpack监控

# CI/CD
## 概念：
CI/CD代表持续集成(continuous Interation)和持续交付/部署(Continuous Delivery/Continuous Deployment),是现代软件开发流程中的关键实践,旨在提高开发效率和软件质量。
1、CI:在遵循严格开发流程规范的项目中,开发人员向线上git仓库提交代码时,通常会自动触发一系列操作,包括自动构建、代码规范检测和自动化测试,这些操作共同构成了持续集成的过程。
  CI的好处是避免不符合规范的代码提交到线上仓库,在一定程度上保证了代码的质量。
2、CD:在CI的基础上,CD进一步自动化了软件的发布流程或部署到生产环境的过程。
  CD的好处是可以使软件的发布/部署更高效。
3、gitlab提供了一套完整的CI/CD功能：pipeline
  pipeline有两个核心构成部分:runner和.gilab-ci.yml文件
  runner:
    runner是指负责运行定义.gitlab-ci.yml文件中的脚本和命令的程序,runner有两种方式获取:
    使用部署在gitlab官方服务器上的runner。无需配置，付费
    使用部署在私有服务器/电脑上的runner.在私有服务器上安装runner的同时，在gitlab中注册该runner,除此之外，还需配置executor。需手动配置，免费
  .gitlab-ci.yml文件:
    .gitlab-ci.yml文件是配置gitlab CI/CI的核心,位于项目的根目录,gitlab会自动识别该文件来执行CI/CD
    .gitlab-ci.yml文件的配置字段相关:
      stage:在gitlab的pipeline中，CI/CD过程被划分为多个阶段(stages)，每个阶 段包含了一组作业(jobs)
        stages:
          - build
          - test
          - deploy
        定义了build、test、deploy(部署)三个阶段,定义顺序即执行顺序
      job:每个阶段(stage)可以进一步划分为一个或多个作业(jobs)。作业是pipeline中的基本执行单元,用于定义执行特定任务的配置。
        build_job:
          stage: build
          script: 
            - npm install
            - npm run build
        定义了build_job作业,包含了以下配置：
          stage: 指定该作业属于哪个阶段
          script: 指定在执行该作业时要运行的命令列表
      rules:rules定义了规则,可以与workflow和job搭配使用,常用的用法是用来定义流水线和作业的触发规则。workflow定义了pipeline的行为,其可与rules参数搭配使用来定义什么情况下执行pipeline。
      tags:tags参数的作用是指定执行job的runner
      before_script:定义在运行pipeline前执行的命令
      variables:统一定义.gitlab-ci.yml需要用到的变量,方便变量的管理。
## 文档:
https://juejin.cn/post/7338698541286834203?searchId=2025081719141748D614D4A7A5C67C0F2F
https://zhuanlan.zhihu.com/p/184936276

# IntersectionObserver
## 概念:IntersectionObserver提供了一种创建intersectionObserver对象的方法,对象用于监测目标元素与视窗的交叉状态,并在交叉状态变化时执行回调函数,回调函数可以接收到元素与视窗交叉的具体数据。
一个intersectionObserver对象可以监听多个目标元素，并通过队列维护回调的执行顺序。
intersectionObserver构造函数接收两个参数:
  callback: 当元素可见比例到达指定阈值后触发的回调函数
  options: 配置对象
intersectionObserver构造函数返回观察器实例，实例携带四个方法：
  observe: 开始监听目标元素
  unobserve: 停止监听目标元素
  disconnect: 关闭观察器
  takeRecords: 返回所有观察目标的IntersectionObserverEntry对象数组
callback: 当交叉状态发生变化(可见比例超过或者低于指定阈值)会进行调用，同时传入两个参数:
  entries: IntersectionObserverEntry数组,每项都描述了目标元素与root的交叉状态
  observer: 被调用的IntersectionObserver实例
  注册的回调函数会在主线程中被执行，所以该函数执行速度要尽可能地快，如果需要执行任何耗时操作，需使用requestIdleCallback函数
options:配置参数，通过修改配置参数可以改变进行监听的视窗，可以缩小或扩大交叉的判定范围，或者调整触发回调的阈值。
  root: 所监听对象的具体祖先元素，默认使用顶级文档的视窗(一般为html)
  rootMargin: 计算交叉时添加到跟边界盒的矩形偏移量，可以有效缩小或扩大根的判定范围从而满足计算需要。所有偏移量均可用像素或百分比来表达，默认为‘0px, 0px, 0px, 0px'(top, right, bottom, left)
intersectionObserverEntry:
  isIntersecting: 返回一个布尔值，下列两种操作均会触发callback:
    目标元素出现在root可视区,返回true
    目标元素从root可视区消失，返回false
  intersectionRatio: 返回目标元素出现在可视区的比例
## intersectionObserver的实现采用requestIdleCallback,其优先级非常低,只有线程空闲下来才会执行该观察器。所以intersectionObserver是异步的,不随着目标元素的滚动同步触发。
## 可以用来做图片懒加载
## 文章： https://juejin.cn/post/7296058491289501696?searchId=2025081817302128568538B3C800B99733

# 闭包
## 概念
闭包是一个函数以及其捆绑的周边环境状态(词法环境)的引用的组合。换而言之，闭包让开发者可以从内部函数访问外部函数的作用域。在js中，闭包会随着函数的创建而被同时创建。
## 特性
1、闭包可以访问到父级函数的变量
2、访问到父级函数的变量不会销毁
## 作用
1、延伸了变量的作用范围
2、隐藏变量，避免全局污染
## 应用
1、利用立即执行函数所形成的闭包来保存当前循环中的i的值，进而解决异步任务所带来的循环结束后所有i都为同一值的问题（循环使用的是var i(由于var创建的变量不是块级作用域),也可以使用let i解决这个问题(块级作用域)）
2、模拟私有方法
## 缺点
1、因为垃圾回收机制的存在，会导致出现不必要的性能消耗
2、不恰当的使用会出现内存泄漏
## 文章 
https://juejin.cn/post/7263628964748197948?searchId=20250823111936F7AFC98858C39BB49131