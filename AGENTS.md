# Repository Guidelines

This repository stores MySQL 8.4 LTS SNF definitions. Keep statements in the matching family directory and use lowercase, hyphenated filenames. Every `.snf` file starts with its authoritative MySQL 8.4 documentation URL.

Write SQL keywords in uppercase and placeholders in lowercase. Follow the `CASE`, `WHERE`, `ONEOFIS`, `PARTOFIS`, and `STATEMENT` conventions documented in `README.md`. Use four spaces for wrapped clauses and do not reformat unrelated definitions. In `alter/`, promote primary operations such as `RENAME`, `ADD`, `DROP`, and `SET` to top-level `CASE` branches; reserve `CASE OPTIONS` for related attributes that can be combined. Definitions are canonical SQL generators: place independent single-use clauses in a fixed order and make each whole clause optional. Use repetition only for genuine lists or statement sequences, not for bags of independent options. The SQL generator removes the final comma inside parentheses, so prefer optional fields with trailing commas over combinatorial `PARTOFIS` branches for parenthesized option lists.

After modifying files, do not run tests or type checks automatically. The user will trigger them when needed.
