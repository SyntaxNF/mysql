# 输入与上下文契约

基线为 MySQL 8.4 LTS。SNF 是规范 SQL 的结构输入，不是服务端 SQL parser、类型系统、权限系统或数据库状态机。以下限制不会因为 SNF parser 通过而自动满足。

## 标识符、值、表达式

- `name` / `new_name` 是主对象及其改名目标；`table`、`database`、`account` 等按领域引用对象。需要限定名称时由输入绑定提供并正确引用每一段；不可把用户字符串直接拼接成 SQL
- `'file'`、`'password'` 等引号内小写名称仍是需要 SQL 字符串转义的输入。`account` 则接受完整账户结构（例如用户和主机两段），不能把完整账户再套成一个字符串
- 名称按语句语义绑定：CREATE/DROP SPATIAL REFERENCE SYSTEM 的 `name` 是无符号 32 位 SRID，并受保留范围限制，不能按 SQL 标识符加引号；DROP USER 的 `name` 是完整账户形态，必须分别处理用户/主机部分
- `type` 是合法 MySQL 数据类型，`value_expression` / `boolean_expression` 等是外部表达式语法输入。完整运算符、函数、类型、字面量词法不在本轮 statement inventory 的覆盖证明内
- `limit`、`offset`、端口、计数、错误码、线程 ID、位置和秒数各有独立数值域，不能视为任意表达式。绑定器必须检查整数性、上下界及该语句是否允许参数/变量
- `simple_value` 仅用于 SIGNAL/RESIGNAL 支持的简单值：参数、局部变量、用户变量、系统变量或字面量（含允许的字符集 introducer）；不能绑定任意 SQL 表达式
- `gtid_set` 输入必须遵循官方 GTID 集格式及 SQL 字符串引用要求，不能任意表达式化。`sqlstate` 是五字符非成功 SQLSTATE，DECLARE 的 MySQL 错误码不能为 0
- LOAD DATA / LOAD XML 的列或用户变量已结构化；XML `tag` 必须包含需要匹配的标签形式。文件、字符集、转义符和权限仍由调用方验证

## 指令、引用与重复

每个文件独立定义名字。`WHERE` 是结构节点；`ONEOFIS` 每个物理行是一个候选；`PARTOFIS` 每个空行分隔的 block 是一个候选；`STATEMENT` 是跨语句类别绑定声明。校验器仅验证本地声明及可达性，不执行跨文件绑定。

`statement [; ...] ;` 中第一个分号是成员之间的分隔符，最后一个分号是每段语句序列必需的末尾分隔符。外部调用者负责最外层语句的终止符；不要给已终止的嵌套语句重复添加分号。`DELIMITER` 是客户端命令，不是 MySQL SQL 语句，不进入定义。

CHANGE REPLICATION SOURCE / FILTER、FLUSH、RESET、SET 等有官方明确规定的逗号成员列表，已按真实列表建模。规范生成时不要重复同一单次设置，也不要把不允许组合的选项放进列表；例如 SOURCE 自动定位和日志位置、REQUIRE_ROW_FORMAT 和主键检查存在依赖。这里的列表不授权把其他固定顺序、单次 clause 改造成任意选项循环。其他无语义差别的可接受排列可规范化成文件规定的固定顺序。

## 存储程序

- `SQL` 与 `COMPOUND` 是绑定类别，不是生成的 SQL 关键字。SQL 类别必须按过程、函数、触发器、事件的上下文筛选，不能允许所有顶层语句。COMPOUND 绑定本仓库 `compound/` 的可执行复合结构
- BEGIN 的声明区按变量/条件、游标、handler 的顺序；对应类别分别绑定 `declare-variable.snf` / `declare-condition.snf`、`declare-cursor.snf`、`declare-handler.snf`。声明不得混入正文 SQL 类别；DECLARE 仅能出现在块开头
- BEGIN END 可以为空。IF/CASE/LOOP/REPEAT/WHILE 的语句序列必须有内容；需要空动作时绑定一个空 BEGIN END
- 结束标签必须对应起始标签，标签有长度、作用域限制；ITERATE 只指向循环，LEAVE 只能引用有效封闭标签。普通语法括号无法表达标签相等关系
- RETURN 只能用于存储函数，并需满足返回类型及执行路径要求；游标必须先声明、打开，再 FETCH，变量数与 SELECT 输出匹配；DECLARE CURSOR 的 SELECT 不能有 INTO
- HANDLER 的 UNDO 虽在手册语法摘要出现，但手册明确说不支持，故不作为可生成分支；NOT ATOMIC 也不属于 MySQL BEGIN 语法
- RESIGNAL 与 GET STACKED DIAGNOSTICS 需要活动 handler。SIGNAL/RESIGNAL 的 SET 列表不能重复信息项；命名条件必须绑定 SQLSTATE 类型的条件。诊断目标必须可写且类型匹配
- 条件优先级、handler 可见性、游标生命周期、声明重名、隐式提交和存储函数/触发器的禁用语句仍需独立语义层检查

## 查询、DDL 与账号

- SELECT/UNION/INTERSECT/EXCEPT 的优先级、括号层级、CTE 可见性、窗口引用和 frame 顺序需要语义检查。表表达式的递归不意味着可以无限展开；限制深度/输出规模属于消费方
- JSON_TABLE 有隐含 lateral 行为，前面不能添加 LATERAL；JSON 路径、列类型、空值/错误处理与嵌套列仍受函数规则约束
- VIEW 的 AS 在 CHECK OPTION 之前。窗口/表别名/列名唯一性、DML 可更新性、generated column 类型和引用、SRID 值、分区方法与索引/外键兼容性不是 parser 验证内容
- 账户认证插件、二/三因子组合、注册流程、密码策略与权限取决于实例配置。GRANT 的静态/动态权限域和对象级别、角色账户命名必须由语义层检查
- DELAYED 拼写在 MySQL 8.4 被接受但忽略；这不表示支持旧版本的延迟写入行为。NDB 与 InnoDB、Enterprise 插件、平台专属选项不能仅凭语法存在就混用

## 管理、复制与事务

- LOCK TABLES 每个对象必须且只能指定一个 READ [LOCAL] 或 WRITE；别名引用、锁持有状态和隐式提交由状态层检查
- START REPLICA 的线程、UNTIL、连接参数、channel 有组合限制；GTID 集、日志位置、复制运行状态、权限、TLS 文件和 NDB/Group Replication 限制需另外验证
- CHANGE REPLICATION FILTER 空列表用于清除过滤项，表过滤项必须是 database.table；同名重复过滤项按服务端规则覆盖，但规范生成应合并为一个设置
- START GROUP_REPLICATION 的 PASSWORD 必须有 USER；认证插件、恢复账户权限及 single-primary 状态是运行时条件
- FLUSH 的非 TABLE 列表不能与 TABLES 结构混拼；FOR EXPORT 必须指定表。各维护选项是否对具体引擎生效由语义层检查
- EXPLAIN JSON_INTO 明确要求 FORMAT=JSON，不能与 FOR CONNECTION 混用。ANALYZE 仅绑定 SELECT/TABLE/多表 UPDATE/DELETE；它会真实执行被分析语句，SNF 定义存在不代表获得执行授权
- SET 默认值、作用域和混合赋值需按变量元数据处理；前置 GLOBAL/SESSION 对同一 SET 后续裸系统变量的作用域传播不能被错误改写
- XA 的 XID 长度、字符集、事务状态、JOIN/RESUME 实际支持限制和持久化行为必须独立检查；START TRANSACTION/COMMIT/ROLLBACK 的会话选项也会改变语义
- SHOW PARSE_TREE、FUNCTION/PROCEDURE CODE 等受构建方式或权限限制；SHOW MASTER STATUS 在 8.4 已移除，不作为生成入口

本轮未连接或启动 MySQL，未执行 SQL，未验证消费方实际生成与数据库接受性。
