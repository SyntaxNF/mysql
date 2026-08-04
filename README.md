# MySQL SNF

本仓库维护 `MySQL 8.4 LTS` SQL 语句的 `SNF`（Syntax Normal Form）定义。定义既用于阅读，也作为规范 SQL 的生成输入，因此需要准确表达分支、可选项、重复结构和语法节点的语义。

## 版本基线

本仓库以 [MySQL 8.4 Reference Manual](https://dev.mysql.com/doc/refman/8.4/en/sql-statements.html) 的 SQL Statement Syntax 为唯一语法基线，不混入 MySQL 5.7、8.0 或 Innovation Release 的兼容写法。

## 目录

- `create/`：创建数据库对象。
- `alter/`：修改数据库对象。
- `drop/`：删除数据库对象。
- `query/`：DML 与查询语句。
- `transaction/`：事务与锁定语句。
- `auth/`：账户、角色和授权语句。
- `compound/`：存储程序复合语句。
- `replication/`：复制与二进制日志控制语句。
- `other/`：预处理、维护、管理和实用语句。

## SNF 语法

### 基础记号

| 记号 | 含义 |
| --- | --- |
| `KEYWORD` | 需要原样生成的 SQL 关键字。 |
| `placeholder` | 需要由调用方提供或由其他语法节点展开的占位符。 |
| `[ syntax ]` | 整个 `syntax` 可选，最多出现一次。 |
| `{ a \| b }` | 必须从候选项中选择一个。 |
| `syntax [...]` | 前一个 `syntax` 可以继续重复，成员之间没有额外分隔符。 |
| `item [, ...]` | `item` 可重复，多个成员之间使用逗号分隔。 |
| `statement [; ...]` | `statement` 可重复，多个语句之间使用分号分隔。 |
| `( syntax )` | 需要原样生成的 SQL 圆括号。 |
| `'value'` | 需要原样生成的 SQL 字符串字面量。 |

省略号只用于服务端语法确实允许重复的列表或语句序列。`[=]` 等紧凑写法表示对应符号本身可选。

### 定义指令

| 指令 | 含义 |
| --- | --- |
| `# CASE label` | 完整语法的顶层分支；同一文件有多个顶层语法时，每个分支都要标记。 |
| `# WHERE name` | 定义一个可复用语法节点；语法相同时可以用逗号同时声明多个名称。 |
| `# ONEOFIS name` | 定义单行候选集合；每个物理行是一个候选，语义等同于 `{ a \| b }`。 |
| `# PARTOFIS name` | 定义多行候选集合；每个空行分隔的 block 是一个候选。 |
| `# STATEMENT name` | 声明可嵌套的 statement 节点，不作为当前文件的顶层语法。 |

例如：

```snf
# CASE RENAME
ALTER TABLE name RENAME TO new_name

# WHERE order_by_expression
col_expression [ ASC | DESC ]

# STATEMENT query_statement
```

## 书写与生成规则

- 每个 `.snf` 文件首行链接到对应的 MySQL 8.4 官方语法页。
- SQL 关键字使用大写，语法占位符使用小写；文件名使用小写和连字符。
- 主语句中相互独立的 clause 使用四个空格缩进，并按语法顺序分行展示。
- `ONEOFIS` 的单个候选不能换行；候选需要跨行时使用 `PARTOFIS`。
- `alter/` 中的 `RENAME`、`ADD`、`DROP`、`SET` 等主操作优先提升为顶层 `# CASE`。只有同类且允许组合的属性才放入 `# CASE OPTIONS`。
- 相互独立且至多出现一次的 clause 按固定顺序分别写成可选项，不得合并成可重复的 option 循环。
- 只有值列表、对象列表、语句序列等真正允许重复的结构才使用 `...`。
- SQL 生成器会移除圆括号内最后一个逗号。因此，圆括号内按固定顺序排列的可选字段可以各自保留尾逗号，无需用 `PARTOFIS` 穷举组合。
- SNF 表达规范 SQL，不收录仅仅能被服务端解析器容忍、但不适合作为标准生成结果的排列方式。

## 占位符命名

当前文件所定义主对象的名称统一使用 `name`；只有该主对象的重命名目标使用 `new_name`。其他对象不得复用 `name`，必须使用对象类型或上下文名称，例如 `table`、`constraint`、`index`、`new_index`、`colname`。通用语义与同级 PostgreSQL SNF 保持一致，MySQL 专属概念则保留准确的领域名称。

### 语法节点后缀

| 后缀 | 适用语义 | 示例 |
| --- | --- | --- |
| `_statement` | 可独立执行或可完整嵌套的 SQL。 | `query_statement` |
| `_expression` | 产生值、布尔结果或关系的表达式。 | `boolean_expression` |
| `_definition` | 列、约束、参数、分区等对象结构的声明。 | `column_definition` |
| `_clause` | 带自身关键字、位置固定且不能独立执行的子句。 | `order_by_clause` |
| `_option` | 一个可选设置或候选项。 | `table_option` |
| `_options` | 一组允许组合的设置。 | `table_options` |
| `_action` | 依赖父语句、不能独立执行的操作片段。 | `on_delete_action` |
| `_alias` | 对象在当前语句中的别名，必须带对象上下文。 | `table_alias` |
| `_target` | 操作或子句的目标结构。 | `conflict_target` |
| `_assignment` | 包含左值、赋值运算符和右值的完整结构。 | `column_assignment` |
| `_parameter` | 配置参数的名称。 | `system_parameter` |
| `_item` | 同类结构中的一个成员。 | `information_item` |
| `_list` | 一组同类成员构成的列表。 | `table_index_list` |
| `_mode` | 行为或状态的选择。 | `lock_mode` |
| `_method` | 实现方式或算法的选择。 | `partition_method` |
| `_value` | 不是任意 SQL 表达式的值或枚举。 | `condition_value` |

标识符直接使用对象类型名，不为追求后缀形式而误标节点角色。例如，`order_by_clause` 包含 `ORDER BY` 关键字，`order_by_expression` 只表示一个排序项；依赖父语句的操作应命名为 `_action`，而不是 `_statement`。

避免使用含义过宽的 `config`，应按角色选择 `_option`、`_options`、`_parameter` 或 `_definition`。引用已有对象时优先使用 `table`、`constraint`、`referenced_table` 等语义名称，而不是泛化的 `_reference`。`_condition` 只用于 `join_condition` 这类带自身结构的条件节点；普通判断条件使用 `boolean_expression`。

### 常用占位符

下表是两个 SNF 仓库共享的常用词汇。不是每个文件都需要声明全部节点，但同一名称在不同文件中应保持相同语义。

| 占位符 | 含义 |
| --- | --- |
| `name` | 当前文件所定义主对象的名称。 |
| `new_name` | 当前主对象重命名后的名称。 |
| `table`、`database`、`schema`、`index`、`constraint`、`tablespace` | 非当前主对象的对应类型标识符。 |
| `colname` | 列名；多个列名仍通过 `colname [, ...]` 表达。 |
| `role`、`user` | 角色或用户标识符；是否可互换由具体语句决定。 |
| `type` | SQL 数据类型。 |
| `collate` | 排序规则标识符。 |
| `argname`、`argtype`、`argmode` | 参数名称、参数类型和参数模式。 |
| `value` | 当前语法位置接受的原子值；若可接受一般 SQL 表达式，应改用 `_expression`。 |
| `value_expression` | 一般值表达式。 |
| `boolean_expression` | 返回真假结果的判断表达式。 |
| `col_expression` | SELECT 列、赋值或其他列上下文中的表达式。 |
| `from_expression` | `FROM` 上下文中的表、连接或关系表达式。 |
| `group_by_expression`、`order_by_expression`、`window_expression` | 对应子句中的一个分组项、排序项或窗口表达式。 |
| `index_column_expression` | 索引中的一个列或表达式项。 |
| `query_statement` | 可作为查询来源或嵌套查询的完整查询语句。 |
| `select_statement` | 语法明确要求 `SELECT` 的完整语句。 |
| `sql_statement` | 上下文允许的通用完整 SQL 语句；优先使用更具体的名称。 |
| `argument_definition` | 一个函数或存储过程参数的完整声明。 |
| `column_definition` | 一个列的完整声明。 |
| `with_query_definition` | `WITH` 中的一个公共表表达式定义。 |
| `table_alias`、`col_alias`、`function_alias` | 表、列或函数结果的别名。 |
| `on_delete_action`、`on_update_action` | 外键 `ON DELETE` 或 `ON UPDATE` 后的动作片段。 |

### MySQL 专属占位符

| 占位符 | 含义 |
| --- | --- |
| `account` | MySQL 账户，通常包含用户和主机部分。 |
| `auth_plugin`、`auth_string` | 认证插件和认证字符串。 |
| `charset` | 字符集。 |
| `engine` | 存储引擎。 |
| `system_variable`、`user_variable` | MySQL 系统变量和用户变量。 |
| `source_log`、`source_position` | 复制源的二进制日志文件和位置。 |
| `relay_log`、`relay_position` | 副本的中继日志文件和位置。 |
