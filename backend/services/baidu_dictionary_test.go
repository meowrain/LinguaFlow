package services

import "testing"

func TestMergeBaiduDictAllowsEmptyEDictString(t *testing.T) {
	raw := `{
		"word_result": {
			"edict": "",
			"simple_means": {
				"word_name": "keynotes",
				"word_means": ["要旨"],
				"symbols": [{
					"ph_en": "ˈkiːnəʊts",
					"ph_am": "ˈkiːnoʊts",
					"parts": [{
						"part": "n.",
						"means": ["主题演讲", "基调"]
					}]
				}]
			}
		}
	}`
	result := &DictionaryResult{}

	if err := mergeBaiduDict(raw, result); err != nil {
		t.Fatalf("mergeBaiduDict returned error: %v", err)
	}
	if result.Word != "keynotes" {
		t.Fatalf("Word = %q, want keynotes", result.Word)
	}
	if result.Translation != "要旨" {
		t.Fatalf("Translation = %q, want 要旨", result.Translation)
	}
	if result.UKPhonetic != "ˈkiːnəʊts" || result.USPhonetic != "ˈkiːnoʊts" {
		t.Fatalf("phonetics were not parsed: %#v", result)
	}
	if len(result.Definitions) != 2 {
		t.Fatalf("Definitions len = %d, want 2: %#v", len(result.Definitions), result.Definitions)
	}
}

func TestMergeBaiduDictIgnoresNonObjectEDictString(t *testing.T) {
	raw := `{
		"word_result": {
			"edict": "要旨",
			"simple_means": {
				"word_name": "keynotes",
				"word_means": ["要旨"]
			}
		}
	}`
	result := &DictionaryResult{}

	if err := mergeBaiduDict(raw, result); err != nil {
		t.Fatalf("mergeBaiduDict returned error: %v", err)
	}
	if result.Word != "keynotes" || result.Translation != "要旨" {
		t.Fatalf("basic fields were not preserved: %#v", result)
	}
}

func TestMergeBaiduDictExtractsFlexibleEDictText(t *testing.T) {
	raw := `{
		"word_result": {
			"edict": {
				"item": [{
					"pos": "n.",
					"tr_group": [{
						"tr": [{"tr": "主题演讲"}, "主旨发言"],
						"example": [{"example": "conference keynotes"}, "opening keynote"]
					}]
				}]
			},
			"simple_means": {
				"word_name": "keynotes",
				"word_means": ["主题演讲"]
			}
		}
	}`
	result := &DictionaryResult{}

	if err := mergeBaiduDict(raw, result); err != nil {
		t.Fatalf("mergeBaiduDict returned error: %v", err)
	}
	if len(result.WebMeanings) != 1 {
		t.Fatalf("WebMeanings len = %d, want 1: %#v", len(result.WebMeanings), result.WebMeanings)
	}
	values := result.WebMeanings[0].Value
	want := []string{"主题演讲", "主旨发言", "conference keynotes", "opening keynote"}
	if len(values) != len(want) {
		t.Fatalf("values = %#v, want %#v", values, want)
	}
	for i := range want {
		if values[i] != want[i] {
			t.Fatalf("values[%d] = %q, want %q; all values = %#v", i, values[i], want[i], values)
		}
	}
}
