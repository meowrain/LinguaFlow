package services

import (
	"strings"
	"testing"

	"github.com/PuerkitoBio/goquery"
)

func TestParseSearchResult(t *testing.T) {
	html := `
		<li class="work blurb group">
			<h4 class="heading">
				<a href="/works/123456">A Neuro Story</a>
				by <a rel="author" href="/users/example">example</a>
			</h4>
			<h5 class="fandoms"><a class="tag">Neuro-sama (Virtual Streamer)</a></h5>
			<ul class="required-tags"><li class="rating"><a class="tag">Teen And Up Audiences</a></li></ul>
			<ul class="tags commas">
				<li class="warnings"><a class="tag">No Archive Warnings Apply</a></li>
				<li class="relationships"><a class="tag">Neuro-sama &amp; Evil Neuro</a></li>
				<li class="characters"><a class="tag">Vedal987</a></li>
				<li class="freeforms"><a class="tag">Fluff</a></li>
			</ul>
			<blockquote class="summary">A short summary.</blockquote>
			<dl class="stats">
				<dd class="language">English</dd>
				<dd class="words">1,234</dd>
				<dd class="chapters">1/1</dd>
				<dd class="kudos">42</dd>
				<dd class="hits">900</dd>
			</dl>
			<p class="datetime">08 Jun 2026</p>
		</li>`

	doc, err := goquery.NewDocumentFromReader(strings.NewReader(html))
	if err != nil {
		t.Fatal(err)
	}

	work := parseSearchResult(doc.Find("li.work").First())
	if work.ID != "123456" {
		t.Fatalf("ID = %q, want 123456", work.ID)
	}
	if work.Title != "A Neuro Story" {
		t.Fatalf("Title = %q", work.Title)
	}
	if len(work.Authors) != 1 || work.Authors[0] != "example" {
		t.Fatalf("Authors = %#v", work.Authors)
	}
	if work.URL != "https://archiveofourown.org/works/123456" {
		t.Fatalf("URL = %q", work.URL)
	}
	if work.Words != "1,234" || work.Chapters != "1/1" || work.Kudos != "42" {
		t.Fatalf("stats were not parsed: %#v", work)
	}
}

func TestSanitizeAO3HTML(t *testing.T) {
	raw := `<div id="chapters"><script>alert(1)</script><p onclick="bad()">Text <a href="https://archiveofourown.org/works/1">link</a></p></div>`
	cleaned := sanitizeAO3HTML(raw)

	if strings.Contains(cleaned, "script") || strings.Contains(cleaned, "onclick") {
		t.Fatalf("unsafe HTML survived: %s", cleaned)
	}
	if !strings.Contains(cleaned, "Text") || !strings.Contains(cleaned, "href=\"https://archiveofourown.org/works/1\"") {
		t.Fatalf("expected safe content missing: %s", cleaned)
	}
}

func TestExtractAO3Chapters(t *testing.T) {
	html := `
		<div id="chapters">
			<div id="chapter-1" class="chapter">
				<div class="preface group">
					<h3 class="title">Chapter 1: Start</h3>
				</div>
				<div class="summary"><blockquote class="userstuff">First summary.</blockquote></div>
				<p>First paragraph.</p>
				<p>Second paragraph.</p>
			</div>
			<div id="chapter-2" class="chapter">
				<h3 class="title">Chapter 2: Next</h3>
				<div class="notes"><blockquote class="userstuff">A note.</blockquote></div>
				<p>Third paragraph.</p>
			</div>
		</div>`
	doc, err := goquery.NewDocumentFromReader(strings.NewReader(html))
	if err != nil {
		t.Fatal(err)
	}

	chapters := extractAO3Chapters(doc.Find("#chapters"), "Work Title")
	if len(chapters) != 2 {
		t.Fatalf("len(chapters) = %d, want 2", len(chapters))
	}
	if chapters[0].ID != "chapter-1" || chapters[0].Title != "Chapter 1: Start" {
		t.Fatalf("chapter 1 metadata = %#v", chapters[0])
	}
	if len(chapters[0].Paragraphs) != 2 || chapters[0].Paragraphs[0] != "First paragraph." {
		t.Fatalf("chapter 1 paragraphs = %#v", chapters[0].Paragraphs)
	}
	if chapters[1].Notes != "A note." || chapters[1].Paragraphs[0] != "Third paragraph." {
		t.Fatalf("chapter 2 = %#v", chapters[1])
	}
}

func TestExtractAO3ChaptersFallsBackFromPlaceholderHeading(t *testing.T) {
	html := `
		<div id="chapters">
			<h3 class="landmark heading" id="work">Work Text:</h3>
			<div class="userstuff"><p>Only paragraph.</p></div>
		</div>`
	doc, err := goquery.NewDocumentFromReader(strings.NewReader(html))
	if err != nil {
		t.Fatal(err)
	}

	chapters := extractAO3Chapters(doc.Find("#chapters"), "A Life of Neuro-sama")
	if len(chapters) != 1 {
		t.Fatalf("len(chapters) = %d, want 1", len(chapters))
	}
	if chapters[0].Title != "A Life of Neuro-sama" {
		t.Fatalf("Title = %q, want work title", chapters[0].Title)
	}
}
