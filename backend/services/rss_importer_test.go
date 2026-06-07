package services

import (
	"testing"
	"time"
)

func TestParseRSSFeed(t *testing.T) {
	data := []byte(`<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>VOA Learning English</title>
    <item>
      <title>Scientists Test a New Tool</title>
      <link>https://learningenglish.voanews.com/a/scientists-test-tool/123.html</link>
      <description><![CDATA[<p>A short summary for learners.</p>]]></description>
      <content:encoded><![CDATA[<p>Scientists are testing a new tool for students.</p><p>The tool helps learners read more carefully.</p>]]></content:encoded>
      <pubDate>Fri, 05 Jun 2026 10:30:00 +0000</pubDate>
      <dc:creator>VOA Learning English</dc:creator>
    </item>
  </channel>
</rss>`)

	feed, err := parseFeed(data)
	if err != nil {
		t.Fatalf("parseFeed returned error: %v", err)
	}
	if feed.Title != "VOA Learning English" {
		t.Fatalf("expected feed title, got %q", feed.Title)
	}
	if len(feed.Items) != 1 {
		t.Fatalf("expected 1 item, got %d", len(feed.Items))
	}

	item := feed.Items[0]
	if item.Title != "Scientists Test a New Tool" {
		t.Fatalf("unexpected item title: %q", item.Title)
	}
	if stripHTML(item.Title) != "Scientists Test a New Tool" {
		t.Fatalf("plain title was not preserved: %q", stripHTML(item.Title))
	}
	if item.ContentEncoded == "" {
		t.Fatal("expected content:encoded to be parsed")
	}
	if item.Creator != "VOA Learning English" {
		t.Fatalf("expected dc:creator, got %q", item.Creator)
	}

	published := parseFeedTime(item.PubDate, time.Time{})
	if published.IsZero() || published.Year() != 2026 {
		t.Fatalf("unexpected published time: %v", published)
	}
}

func TestExtractArticleHTML(t *testing.T) {
	data := []byte(`<!doctype html>
<html>
  <head>
    <meta property="og:image" content="/images/story.jpg">
    <meta name="description" content="A description for search.">
    <meta property="article:published_time" content="2026-06-05T10:30:00Z">
  </head>
  <body>
    <nav>Navigation should not be included.</nav>
    <article class="article-content">
      <h1>Headline</h1>
      <p>Scientists are testing a new tool for students.</p>
      <p>The tool helps learners read more carefully.</p>
    </article>
  </body>
</html>`)

	extracted := extractArticleHTML(data)
	if extracted.CoverImage != "/images/story.jpg" {
		t.Fatalf("unexpected cover image: %q", extracted.CoverImage)
	}
	if extracted.Description != "A description for search." {
		t.Fatalf("unexpected description: %q", extracted.Description)
	}
	if extracted.PublishedAt == nil || extracted.PublishedAt.Year() != 2026 {
		t.Fatalf("unexpected published time: %v", extracted.PublishedAt)
	}
	if countWords(extracted.Content) < 10 {
		t.Fatalf("expected article body text, got %q", extracted.Content)
	}
	if extracted.Content == "" || extracted.Content == "Navigation should not be included." {
		t.Fatalf("unexpected article content: %q", extracted.Content)
	}
}
