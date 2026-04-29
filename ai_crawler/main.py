#!/usr/bin/env python3
"""AI 智能爬虫 — CLI 入口

用法示例:
  # 单页提取
  python3 -m ai-crawler "https://news.ycombinator.com" --task "提取前30条新闻的标题、链接和得分"

  # 多页深度爬取
  python3 -m ai-crawler "https://example.com/products" \\
      --task "提取所有产品的名称、价格、描述" \\
      --depth 2 --max-pages 5

  # 不跟踪链接，只提取单页
  python3 -m ai-crawler "https://example.com" \\
      --task "提取联系方式" --no-follow

  # 带截图
  python3 -m ai-crawler "https://example.com" --task "提取标题" --screenshot
"""

import argparse
import asyncio
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from ai_crawler.crawler import CrawlTask, run_crawl


def main():
    parser = argparse.ArgumentParser(
        description="🕷️ AI 智能爬虫 — 用自然语言描述你想提取的数据",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例:
  %(prog)s "https://news.ycombinator.com" --task "提取新闻标题和链接"
  %(prog)s "https://quotes.toscrape.com" --task "提取所有名言和作者" --depth 2
  %(prog)s "https://books.toscrape.com" --task "提取书名和价格" --max-pages 3
        """,
    )

    parser.add_argument("url", help="起始 URL")
    parser.add_argument(
        "--task", "-t",
        required=True,
        help="用自然语言描述要提取的数据（例如: '提取所有产品名称和价格'）",
    )
    parser.add_argument(
        "--max-pages", "-n",
        type=int,
        default=10,
        help="最大爬取页面数 (默认: 10)",
    )
    parser.add_argument(
        "--depth", "-d",
        type=int,
        default=2,
        help="最大爬取深度 (默认: 2)",
    )
    parser.add_argument(
        "--delay",
        type=float,
        default=1.0,
        help="页面间延迟秒数 (默认: 1.0)",
    )
    parser.add_argument(
        "--no-follow",
        action="store_true",
        help="不跟踪链接，只爬取起始页",
    )
    parser.add_argument(
        "--screenshot",
        action="store_true",
        help="保存页面截图",
    )
    parser.add_argument(
        "--output", "-o",
        default="crawl_output",
        help="输出目录 (默认: crawl_output)",
    )
    parser.add_argument(
        "--model",
        default=None,
        help="指定 AI 模型 (默认: doubao-seed-2.0-pro)",
    )

    args = parser.parse_args()

    if args.model:
        from ai_crawler import config
        config.AI_MODEL = args.model

    crawl_task = CrawlTask(
        start_url=args.url,
        task=args.task,
        max_pages=args.max_pages,
        max_depth=args.depth,
        delay=args.delay,
        screenshot=args.screenshot,
        follow_links=not args.no_follow,
        output_dir=args.output,
    )

    asyncio.run(run_crawl(crawl_task))


if __name__ == "__main__":
    main()
