# 验证说明

## 本轮授权与边界

2026-09-30 用户明确批准本轮 SNF parser、相关回归检查与草稿 PR。仓库 AGENTS.md 的默认约定保持不变：之后不自动启动测试，没有添加自动 CI。

验证使用官方 [SyntaxNF/parser](https://github.com/SyntaxNF/parser/tree/bcf2c3ac58b45e7d5391716393586b00b11e0c1a)，固定 commit `bcf2c3ac58b45e7d5391716393586b00b11e0c1a`，package 版本 `0.1.0`。本轮复用该版本已构建的 ESM 产物，未修改 parser 已跟踪源码；准备环境有一个本地未跟踪 pnpm workspace 配置，不包含在本仓库中。ESM 入口 SHA-256 为 `5aa14167ad371522ed5815719f74639aa1526ff71ed1dfd8ec0a00975f74e510`；入口 hash 本身不代替其余模块和源码 revision 校验。

## 用户主动运行

在独立目录取得上述固定 parser revision，按其 README 安装依赖并构建。然后在此仓库运行：

```sh
export SNF_PARSER_MODULE=/absolute/path/to/parser/dist/esm/index.mjs
npm run validate:snf
npm run test:validation
# 可选：更新逐文件审计 JSON
npm run validate:snf -- docs/validation-audit.json
git diff --check
```

此仓库不在测试时联网下载 parser，不启动数据库，不生成 `.snf.json`。`SNF_PARSER_MODULE` 是显式输入，脚本不会仅凭环境变量路径证明版本正确；调用者须核对实际源码 revision。

## 检查层次

1. 官方 `SNFDocumentParser` 解析全部 SNF，检查方/花括号、重复记号等；源码及所有物理行可无损还原，AST span 对应原文
2. 仓库约定检查：8.4 官方首行来源、空白、CASE/WHERE/ONEOFIS/PARTOFIS/STATEMENT 指令、唯一名称、别名、块归属、非空候选、入口、本地引用可达性和递归记录
3. 重复单元检查：后缀 LOOP 必须紧跟命名节点或显式组，不能只跟右括号/引号等字面量；多 token 成员使用独立 helper，避免仅重复最后一个 token。真实 `exchangeLoopNode` 回归检查确认 helper 被正确绑定
4. inventory 检查：所有活动语法项有文件映射，所有 SNF 文件都被映射，状态取自明确集合，官方来源和证据不能为空
5. 校验器正反例回归：错误指令、重名、无主块、不可达 helper、非法重复、空分支等必须失败；合法递归、别名、类别和固定 literal 处理必须通过
6. 具体语法的 source/AST contract 回归：BEGIN 分号与声明顺序、LOCK TABLES、复制组合、SHOW/EXPLAIN、SET、VIEW、ROLLUP、JSON_TABLE、ALTER USER 等本轮重点结构

## 不等同于通过的内容

- parser 将引号和圆括号作为叶子符号，不能证明 SQL 词法、配对、数据类型、表达式或服务端接受性
- `STATEMENT` 类别尚需消费方绑定到其他定义；本地引用可达性不是跨文件导入的实现或证明
- `inputs` 记录全部未绑定的变量候选；其中既有正常标识符/值，也有表达式和 opaque 输入。未声明名称不能自动区分拼写错误与外部输入
- Grammar 回归是所列结构的防退化测试，不是穷尽 SQL 正反例执行，更不是消费方集成测试
- `structured` 仅代表文档语法骨架已显式表达；`partial` 的输入/结构/上下文边界仍然存在，不能因 parse pass 改为“完整覆盖”
- 本轮没有连接、启动或执行任何 MySQL 实库；没有 SQL 接受性、执行结果、权限或运行时状态的验证

精确本轮结果见 [validation-report.md](validation-report.md)，逐文件数据见 [validation-audit.json](validation-audit.json)，语义边界见 [input-contracts.md](input-contracts.md)。
