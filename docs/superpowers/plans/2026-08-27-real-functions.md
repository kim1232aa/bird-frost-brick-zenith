# 真功能补壳 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 让无界创作台已有板块按真实行为工作，不删除任何入口、供应商、模板或按钮。

**Architecture:** 只改空壳与骗人文案。模型选择读写 boundless-studio:current-models；生成成功才 ops.spend；选中的 provider/model 原样提交。画布完整 xyflow 优先，lite 仅作加载失败后备。

**Tech Stack:** TanStack Router, Zustand persist, studio adapters, React 19, studio tokens #00C758 #00D2EF #FFFFFF #0F172A.

**Spec:** 用户原话「不可以删除，我不接受，我只要真功能」。

## Global Constraints

- 不删除已有板块、模型、供应商、按钮、模板、JSON 面板、lite 后备页
- 不改用户选中的线路
- 文案必须和真实行为一致
- 生成必须前台点击
- 错误写在控件附近，role=alert
- 参考样片不等于当前成片
