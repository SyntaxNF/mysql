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
| `syntax [...]` | 前一个 `syntax` 可以出现零次或多次，成员之间没有额外分隔符。 |
| `item [, ...]` | `item` 可以出现零次或多次，多个成员之间使用逗号分隔。 |
| `statement [; ...]` | `statement` 可以出现零次或多次，多个语句之间使用分号分隔。 |
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
- SQL 关键字使用大写，占位符使用小写；文件名使用小写和连字符，独立 clause 使用四个空格缩进。
- `ONEOFIS` 的单个候选不能换行；跨行候选使用 `PARTOFIS`。
- `alter/` 的主操作使用顶层 `CASE`，同类且允许组合的属性使用 `CASE OPTIONS`。
- 独立、至多出现一次的 clause 按固定顺序分别写成可选项；只有真正的列表或语句序列使用重复结构。
- 重复结构允许零次或多次；包含关键字、括号或分号的整个可选组仍保留其作用。
- 生成器移除圆括号内的尾逗号，因此括号内固定顺序的可选字段可各自保留尾逗号；括号外不依赖此清理。
- 表达式、正文和复用查询由调用方按 SQL 上下文提供，列表成员数量按具体语句要求填写。

## 占位符命名

主对象使用 `name`，其重命名目标使用 `new_name`；其他对象使用 `table`、`constraint`、`index`、`colname` 等语义名称。共享语义与 PostgreSQL SNF 保持一致，MySQL 专属概念保留 `account`、`auth_plugin`、`charset`、`engine` 等领域名称。

节点按角色命名：完整 SQL 使用 `_statement`，表达式使用 `_expression`，对象结构使用 `_definition`，带关键字的位置片段使用 `_clause`，单个设置或设置组使用 `_option` / `_options`，依赖父语句的操作使用 `_action`。别名使用带上下文的 `_alias`，其余按实际含义使用 `_target`、`_assignment`、`_parameter`、`_item` / `_list`、`_mode`、`_method`、`_value`；避免泛化的 `config` 和 `_reference`。普通判断使用 `boolean_expression`，`_condition` 留给 `join_condition` 这类结构节点。

## 开发命令

按需手动运行。需要 Node.js 20.19+ 或 22.12+、Git、pnpm，以及固定版本的 [SNF parser](https://github.com/SyntaxNF/parser)：

```sh
git clone https://github.com/SyntaxNF/parser.git ../snf-parser
git -C ../snf-parser checkout --detach bcf2c3ac58b45e7d5391716393586b00b11e0c1a
(cd ../snf-parser && pnpm install --frozen-lockfile)
SNF_PARSER_ROOT=../snf-parser npm run validate
SNF_PARSER_ROOT=../snf-parser npm test
```

已有同版本的干净 parser checkout 可直接复用；`SNF_PARSER_ROOT` 指向该目录。脚本直接加载固定版本源码及锁定依赖，无需构建 parser。
