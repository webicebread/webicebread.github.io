---
title: "{{ replace .File.ContentBaseName `-` ` ` | title }}"   # ← 换成中文标题
date: {{ .Date }}
slug: "{{ .File.ContentBaseName }}"    # ← 改成下一个三位编号（如 "004"），链接为 /p/<编号>/；文件夹名保持英文便于查找
description:      # 一句话摘要（分享卡片 og:description / SEO 会用到）
categories:
    - 随笔
tags: []          # 例如 [黄昏, 随笔]
# 封面（可选）：把图片（如 cover.png）放进本文件夹，再取消下一行注释
# image: cover.png
---

（在这里开始写……）
