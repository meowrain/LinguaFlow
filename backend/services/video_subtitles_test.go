package services

import (
	"strings"
	"testing"
)

func TestParseSRT(t *testing.T) {
	content := `1
00:00:01,000 --> 00:00:03,500
Hello everyone.

2
00:00:04,000 --> 00:00:07,000
Today I want to talk about learning.`

	segments, err := ParseSRT(content)
	if err != nil {
		t.Fatalf("ParseSRT returned error: %v", err)
	}
	if len(segments) != 2 {
		t.Fatalf("expected 2 segments, got %d", len(segments))
	}
	if segments[0].StartSeconds != 1 || segments[0].EndSeconds != 3.5 {
		t.Fatalf("unexpected first segment timing: %#v", segments[0])
	}
	if segments[1].Text != "Today I want to talk about learning." {
		t.Fatalf("unexpected second segment text: %q", segments[1].Text)
	}
}

func TestParseVTTWithSettingsAndTags(t *testing.T) {
	content := `WEBVTT

00:00:02.000 --> 00:00:05.000 align:start position:0%
<v Speaker>Welcome &amp; listen carefully.</v>`

	segments, err := ParseVTT(content)
	if err != nil {
		t.Fatalf("ParseVTT returned error: %v", err)
	}
	if len(segments) != 1 {
		t.Fatalf("expected 1 segment, got %d", len(segments))
	}
	if segments[0].Text != "Welcome & listen carefully." {
		t.Fatalf("unexpected cleaned text: %q", segments[0].Text)
	}
}

func TestCleanTranscriptionSegmentsSortsAndFixesTiming(t *testing.T) {
	segments := CleanTranscriptionSegments([]TranscriptionSegment{
		{StartSeconds: 5, EndSeconds: 5, Text: " later "},
		{StartSeconds: -1, EndSeconds: 2, Text: " first "},
		{StartSeconds: 3, EndSeconds: 4, Text: "   "},
	})

	if len(segments) != 2 {
		t.Fatalf("expected 2 cleaned segments, got %d", len(segments))
	}
	if segments[0].StartSeconds != 0 || segments[0].Text != "first" {
		t.Fatalf("unexpected first cleaned segment: %#v", segments[0])
	}
	if segments[1].EndSeconds <= segments[1].StartSeconds {
		t.Fatalf("expected timing to be fixed: %#v", segments[1])
	}
}

func TestCleanTranscriptionSegmentsSplitsLongUnpunctuatedTranscript(t *testing.T) {
	segments := CleanTranscriptionSegmentsWithDuration([]TranscriptionSegment{
		{
			StartSeconds: 0,
			EndSeconds:   1,
			Text:         "we are keeping the ocean wild and you can join us today we can actually see the progression from a damaged reef after some time with care and restoration this work looks pretty good as compared to where it started",
		},
	}, 120)

	if len(segments) < 3 {
		t.Fatalf("expected long transcript to be split into multiple subtitle cues, got %d: %#v", len(segments), segments)
	}
	if segments[len(segments)-1].EndSeconds != 120 {
		t.Fatalf("expected fallback duration to be used, got last end %.2f", segments[len(segments)-1].EndSeconds)
	}
	for _, segment := range segments {
		if len(segment.Text) == 0 {
			t.Fatalf("empty subtitle cue: %#v", segment)
		}
		if segment.EndSeconds <= segment.StartSeconds {
			t.Fatalf("invalid subtitle timing: %#v", segment)
		}
		if words := len(splitTestFields(segment.Text)); words > maxSubtitleWords {
			t.Fatalf("subtitle cue has too many words: %d in %q", words, segment.Text)
		}
	}
}

func TestCleanTranscriptionSegmentsSplitsLongPunctuatedTranscript(t *testing.T) {
	segments := CleanTranscriptionSegmentsWithDuration([]TranscriptionSegment{
		{
			StartSeconds: 10,
			EndSeconds:   70,
			Text:         "We are keeping the ocean wild, and you can join us. There is reason for hope, and you can see progress. People are gathering data, sharing stories, and helping restore the sea.",
		},
	}, 0)

	if len(segments) != 3 {
		t.Fatalf("expected 3 sentence cues, got %d: %#v", len(segments), segments)
	}
	if segments[0].StartSeconds != 10 || segments[len(segments)-1].EndSeconds != 70 {
		t.Fatalf("expected original time span to be preserved: %#v", segments)
	}
}

func TestCleanTranscriptionSegmentsRedistributesCompressedTimeline(t *testing.T) {
	input := []TranscriptionSegment{
		{StartSeconds: 0, EndSeconds: 0.2, Text: "we are keeping the ocean wild and you can join us"},
		{StartSeconds: 0.2, EndSeconds: 0.4, Text: "today we can actually see the progression from a damaged reef"},
		{StartSeconds: 0.4, EndSeconds: 0.6, Text: "after some time with care and restoration this work looks good"},
		{StartSeconds: 0.6, EndSeconds: 0.8, Text: "people are gathering data sharing stories and helping restore the sea"},
		{StartSeconds: 0.8, EndSeconds: 1, Text: "there is reason for hope and this is why it matters"},
	}

	segments := CleanTranscriptionSegmentsWithDuration(input, 120)

	if len(segments) != len(input) {
		t.Fatalf("expected compressed timeline to be redistributed without changing segment count, got %d", len(segments))
	}
	if segments[0].StartSeconds != 0 || segments[len(segments)-1].EndSeconds != 120 {
		t.Fatalf("expected segments to span fallback duration, got %#v", segments)
	}
	if segments[1].StartSeconds <= 0.2 {
		t.Fatalf("expected second segment to move beyond compressed input timeline, got %#v", segments[1])
	}
	for index := 1; index < len(segments); index++ {
		if segments[index].StartSeconds < segments[index-1].EndSeconds {
			t.Fatalf("expected non-overlapping segments, got %#v after %#v", segments[index], segments[index-1])
		}
	}
}

func splitTestFields(text string) []string {
	return strings.Fields(text)
}
