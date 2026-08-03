# Repository Guidelines

This repository stores MySQL 8.4 LTS SNF definitions. Keep statements in the matching family directory and use lowercase, hyphenated filenames. Every `.snf` file starts with its authoritative MySQL 8.4 documentation URL.

Write SQL keywords in uppercase and placeholders in lowercase. Follow the `CASE`, `WHERE`, `ONEOFIS`, `PARTOFIS`, and `STATEMENT` conventions documented in `README.md`. Use four spaces for wrapped clauses and do not reformat unrelated definitions.

After modifying files, do not run tests or type checks automatically. The user will trigger them when needed.
