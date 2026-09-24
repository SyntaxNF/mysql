# SQL 定义覆盖检查

基线：[MySQL 8.4 SQL Statement Syntax](https://dev.mysql.com/doc/refman/8.4/en/sql-statements.html)。检查日期：2026-09-24。

## 结论

现有 136 个文件已覆盖主要语句族，但存在子句遗漏与错误组合。官方目录不是“一页一个文件”：SHOW 子命令、游标动作及多个查询专题在同一 SNF 中表达，不能直接把页面数当成语句覆盖率。

## 本轮修正

- UPDATE/DELETE 的所有分支补 WITH [RECURSIVE] 和 CTE；展开表源、派生表、JOIN 与索引提示。
- INSERT/REPLACE 的 SET 赋值支持 DEFAULT。
- SELECT 补带括号的派生表、重复索引提示、空 USE INDEX () 和 CROSS JOIN 条件；删除基本表不支持的列别名列表。
- 窗口 frame 不再提供 MySQL 8.4 不支持的 GROUPS。
- CREATE TABLE 将外键与 CHECK 分开为独立候选，避免强制生成 FOREIGN KEY ... CHECK ...。
- SHOW 补 PARSE_TREE、COUNT(*) ERRORS/WARNINGS，以及 INDEX 的 EXTENDED/WHERE。

## 官方专题与定义对应

| 官方专题 | 定义 |
| --- | --- |
| CREATE/DROP FUNCTION | create/function.snf、drop/function.snf（存储函数）；loadable-function.snf（可加载函数） |
| CREATE TEMPORARY TABLE / LIKE / SELECT | create/table.snf 的变体 |
| INSERT SELECT / ON DUPLICATE KEY UPDATE / DELAYED | query/insert.snf |
| UNION / INTERSECT / EXCEPT | query/query-expression.snf |
| JOIN / SELECT INTO | query/select.snf |
| OPEN / FETCH / CLOSE | compound/cursor.snf |
| DECLARE | compound/declare-*.snf |
| SET sql_log_bin | other/set.snf 的系统变量赋值 |
| SHOW 的各子命令 | other/show.snf 的 CASE |

## 验证范围与限制

本轮进行了官方目录和重点语法页对照、静态差异检查，未运行测试、类型检查、构建或数据库执行，未生成 .snf.json。账户认证、复制选项、存储引擎属性等已有复杂定义未逐项证明穷尽；表达式和部分表函数等叶子节点仍接受原始 SQL。语句入口存在不等于所有合法组合已覆盖或所有非法组合均被排除。
