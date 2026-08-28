import { useCallback, useEffect, useMemo, useState } from 'react';
import { Linking, Modal, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Bookmark, ChevronLeft, ExternalLink, MoreVertical, Pencil, Plus, Search, Trash2, X } from 'lucide-react-native';
import { router } from 'expo-router';
import { useApp } from '@/components/AppProvider';
import { supabase } from '@/lib/supabase';

type BookmarkItem = {
  id: string;
  title: string;
  url: string | null;
  category: string;
  tag: string;
  notes: string | null;
  created_at: string;
};

type CategoryDef = { label: string; tags: string[] };

const CATEGORIES: CategoryDef[] = [
  { label: 'Videos & Shows', tags: ['Movies/Series', 'Documentaries', 'YouTube Videos', 'Anime/Manga'] },
  { label: 'Audio', tags: ['Audiobooks', 'Podcasts', 'Playlists', 'Song', 'DJ Mixes'] },
  { label: 'Written', tags: ['Books', 'Articles/Blogs', 'Newsletters', 'PDFs', 'Social Threads'] },
  { label: 'Other', tags: ['Online Courses', 'Tools Inspos', 'Miscellaneous Link'] },
];

const ALL_CATEGORY = 'All';
const CATEGORY_LABELS = [ALL_CATEGORY, ...CATEGORIES.map((c) => c.label)];

const tagsForCategory = (cat: string): string[] => {
  if (cat === ALL_CATEGORY) return CATEGORIES.flatMap((c) => c.tags);
  return CATEGORIES.find((c) => c.label === cat)?.tags ?? [];
};

const FONT = 'Poppins-Regular';
const FONT_MED = 'Poppins-Medium';
const FONT_SEMI = 'Poppins-SemiBold';
const FONT_BOLD = 'Poppins-Bold';

export default function BookmarksScreen() {
  const { accentForeground, accentWash, isDark, onAccent } = useApp();
  const [bookmarks, setBookmarks] = useState<BookmarkItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedCategory, setSelectedCategory] = useState(ALL_CATEGORY);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState<BookmarkItem | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [category, setCategory] = useState(CATEGORIES[0].label);
  const [tag, setTag] = useState(CATEGORIES[0].tags[0]);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error: loadErr } = await supabase
      .from('bookmarks')
      .select('id, title, url, category, tag, notes, created_at')
      .order('created_at', { ascending: false });
    if (loadErr) setError('Your bookmarks could not be loaded.');
    else setBookmarks((data ?? []) as BookmarkItem[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const availableTags = useMemo(() => tagsForCategory(selectedCategory), [selectedCategory]);

  const filtered = useMemo(() => {
    let items = bookmarks;
    if (selectedCategory !== ALL_CATEGORY) {
      items = items.filter((b) => b.category === selectedCategory);
    }
    if (selectedTag) {
      items = items.filter((b) => b.tag === selectedTag);
    }
    if (query.trim()) {
      const q = query.toLowerCase();
      items = items.filter((b) =>
        b.title.toLowerCase().includes(q) ||
        (b.url && b.url.toLowerCase().includes(q)) ||
        b.tag.toLowerCase().includes(q)
      );
    }
    return items;
  }, [bookmarks, selectedCategory, selectedTag, query]);

  const handleCategoryChange = (cat: string) => {
    setSelectedCategory(cat);
    setSelectedTag(null);
  };

  const openNew = () => {
    setEditingId(null);
    setTitle('');
    setUrl('');
    setCategory(selectedCategory !== ALL_CATEGORY ? selectedCategory : CATEGORIES[0].label);
    const cat = selectedCategory !== ALL_CATEGORY ? selectedCategory : CATEGORIES[0].label;
    const catTags = tagsForCategory(cat);
    setTag(selectedTag && catTags.includes(selectedTag) ? selectedTag : catTags[0]);
    setNotes('');
    setError(null);
    setModalOpen(true);
  };

  const openEdit = (b: BookmarkItem) => {
    setEditingId(b.id);
    setTitle(b.title);
    setUrl(b.url ?? '');
    setCategory(b.category);
    setTag(b.tag);
    setNotes(b.notes ?? '');
    setError(null);
    setDetailOpen(null);
    setModalOpen(true);
  };

  const handleCategorySelect = (cat: string) => {
    setCategory(cat);
    const catTags = tagsForCategory(cat);
    setTag(catTags[0]);
  };

  const saveBookmark = async () => {
    if (!title.trim()) {
      setError('Give your bookmark a title.');
      return;
    }
    setSaving(true);
    const payload = {
      title: title.trim(),
      url: url.trim() || null,
      category,
      tag,
      notes: notes.trim() || null,
    };
    if (editingId) {
      const { data, error: saveErr } = await supabase
        .from('bookmarks')
        .update(payload)
        .eq('id', editingId)
        .select('id, title, url, category, tag, notes, created_at')
        .maybeSingle();
      if (saveErr || !data) {
        setError('The bookmark could not be updated.');
      } else {
        setBookmarks((c) => c.map((item) => item.id === editingId ? data as BookmarkItem : item));
        setModalOpen(false);
        setEditingId(null);
      }
    } else {
      const { data, error: saveErr } = await supabase
        .from('bookmarks')
        .insert(payload)
        .select('id, title, url, category, tag, notes, created_at')
        .maybeSingle();
      if (saveErr || !data) {
        setError('The bookmark could not be saved.');
      } else {
        setBookmarks((c) => [data as BookmarkItem, ...c]);
        setModalOpen(false);
      }
    }
    setSaving(false);
  };

  const deleteBookmark = async (b: BookmarkItem) => {
    const prev = bookmarks;
    setBookmarks((c) => c.filter((item) => item.id !== b.id));
    setDetailOpen(null);
    const { error: delErr } = await supabase.from('bookmarks').delete().eq('id', b.id);
    if (delErr) {
      setError('Could not delete the bookmark.');
      setBookmarks(prev);
    }
  };

  const openLink = (link: string) => {
    Linking.openURL(link).catch(() => {});
  };

  return (
    <SafeAreaView style={[styles.safe, isDark && styles.safeDark]}>
      {/* Header */}
      <View style={[styles.header, isDark && styles.headerDark]}>
        <Pressable onPress={() => router.push('/modules')} style={[styles.backBtn, { backgroundColor: accentForeground }]} hitSlop={12}>
          <ChevronLeft color="#FFFFFF" size={22} strokeWidth={2.4} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: accentForeground }]}>BOOKMARKS</Text>
        <Pressable onPress={() => setMenuOpen(true)} style={styles.bellBtn} hitSlop={12}>
          <MoreVertical color={isDark ? '#F4F2EE' : '#27241F'} size={20} />
        </Pressable>
      </View>

      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <Pressable style={styles.menuShade} onPress={() => setMenuOpen(false)}>
          <Pressable
            style={[styles.menuCard, { backgroundColor: isDark ? '#1C1C1C' : '#FFFFFF', borderColor: isDark ? '#2A2A2A' : '#ECE9E4' }]}
            onPress={(event) => event.stopPropagation()}
          >
            <Pressable
  onPress={() => {
    setMenuOpen(false);
    router.push('/(tabs)/profile');
  }}
  style={styles.menuItem}
>
              <Text style={[styles.menuItemText, { color: isDark ? '#F4F2EE' : '#27241F' }]}>Settings</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Full-width search */}
        <View style={[styles.search, isDark && styles.searchDark]}>
          <Search color={isDark ? '#BDB9B1' : '#8D8B86'} size={18} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search bookmarks"
            placeholderTextColor={isDark ? '#8C8982' : '#A4A09A'}
            style={[styles.searchInput, isDark && styles.darkText]}
          />
        </View>

        {error && <Text style={styles.error}>{error}</Text>}

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
          {CATEGORY_LABELS.map((cat) => (
            <Pressable
              key={cat}
              onPress={() => handleCategoryChange(cat)}
              style={[styles.filter, isDark && styles.filterDark, selectedCategory === cat && { backgroundColor: accentForeground, borderColor: accentForeground }]}
            >
              <Text style={[styles.filterText, isDark && styles.darkMuted, selectedCategory === cat && { color: onAccent, fontFamily: FONT_SEMI }]}>{cat}</Text>
            </Pressable>
          ))}
        </ScrollView>

        {selectedCategory !== ALL_CATEGORY && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tagRow}>
            <Pressable
              onPress={() => setSelectedTag(null)}
              style={[styles.tagChip, isDark && styles.tagChipDark, !selectedTag && { backgroundColor: accentWash, borderColor: accentForeground }]}
            >
              <Text style={[styles.tagChipText, isDark && styles.darkMuted, !selectedTag && { color: accentForeground, fontFamily: FONT_SEMI }]}>All</Text>
            </Pressable>
            {availableTags.map((t) => (
              <Pressable
                key={t}
                onPress={() => setSelectedTag(selectedTag === t ? null : t)}
                style={[styles.tagChip, isDark && styles.tagChipDark, selectedTag === t && { backgroundColor: accentWash, borderColor: accentForeground }]}
              >
                <Text style={[styles.tagChipText, isDark && styles.darkMuted, selectedTag === t && { color: accentForeground, fontFamily: FONT_SEMI }]}>{t}</Text>
              </Pressable>
            ))}
          </ScrollView>
        )}

        {loading ? (
          <Text style={[styles.emptyText, isDark && styles.darkMuted]}>Loading your bookmarks...</Text>
        ) : filtered.length === 0 ? (
          <View style={styles.empty}>
            <Text style={[styles.emptyText, isDark && styles.darkMuted]}>
              {bookmarks.length === 0 ? 'No bookmarks yet. Tap + to save your first resource.' : 'No bookmarks match this filter.'}
            </Text>
          </View>
        ) : (
          <View style={[styles.list, isDark && styles.cardDark]}>
            {filtered.map((bk, i) => (
              <Pressable
                key={bk.id}
                onPress={() => setDetailOpen(bk)}
                style={[styles.row, i < filtered.length - 1 && styles.rowBorder, isDark && styles.rowBorderDark]}
              >
                <View style={[styles.rowIcon, { backgroundColor: accentWash }]}>
                  <Bookmark color={accentForeground} size={16} strokeWidth={2.2} />
                </View>
                <View style={styles.rowCopy}>
                  <Text style={[styles.rowTitle, isDark && styles.darkText]} numberOfLines={1}>{bk.title}</Text>
                  <View style={styles.rowMeta}>
                    {bk.url ? (
                      <Text style={[styles.rowUrl, isDark && styles.darkMuted]} numberOfLines={1}>{bk.url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}</Text>
                    ) : null}
                    <View style={[styles.tagPill, { backgroundColor: accentForeground }]}>
                      <Text style={[styles.tagPillText, { color: onAccent }]}>{bk.tag}</Text>
                    </View>
                  </View>
                </View>
              </Pressable>
            ))}
          </View>
        )}

        <View style={styles.countRow}>
          <Text style={[styles.countText, isDark && styles.darkMuted]}>{filtered.length} bookmark{filtered.length === 1 ? '' : 's'}{selectedCategory !== ALL_CATEGORY ? ` in ${selectedCategory}` : ''}</Text>
        </View>
      </ScrollView>

      {/* Floating + button */}
      <Pressable onPress={openNew} style={[styles.fab, { backgroundColor: accentForeground }]} hitSlop={12}>
        <Plus color={onAccent} size={26} strokeWidth={2.6} />
      </Pressable>

      {/* Add/Edit modal */}
      <Modal visible={modalOpen} transparent animationType="slide" onRequestClose={() => setModalOpen(false)}>
        <View style={styles.modalShade}>
          <View style={[styles.modalCard, isDark && styles.modalDark]}>
            <View style={styles.modalTitleRow}>
              <Text style={[styles.modalTitle, isDark && styles.darkText]}>{editingId ? 'Edit bookmark' : 'Save resource'}</Text>
              <Pressable onPress={() => { setModalOpen(false); setEditingId(null); }}><X color={isDark ? '#F4F2EE' : '#5A5751'} size={21} /></Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 8 }}>
              <Text style={[styles.label, isDark && styles.darkMuted]}>Title</Text>
              <TextInput value={title} onChangeText={setTitle} placeholder="What are you saving?" placeholderTextColor="#9B978F" style={[styles.input, isDark && styles.inputDark]} autoFocus />

              <Text style={[styles.label, isDark && styles.darkMuted]}>Link (optional)</Text>
              <TextInput value={url} onChangeText={setUrl} placeholder="https://..." placeholderTextColor="#9B978F" style={[styles.input, isDark && styles.inputDark]} autoCapitalize="none" keyboardType="url" />

              <Text style={[styles.label, isDark && styles.darkMuted]}>Category</Text>
              <View style={styles.chipRow}>
                {CATEGORIES.map((c) => (
                  <Pressable key={c.label} onPress={() => handleCategorySelect(c.label)} style={[styles.chip, category === c.label && { backgroundColor: accentForeground, borderColor: accentForeground }]}>
                    <Text style={[styles.chipText, isDark && styles.darkMuted, category === c.label && { color: onAccent, fontFamily: FONT_SEMI }]}>{c.label}</Text>
                  </Pressable>
                ))}
              </View>

              <Text style={[styles.label, isDark && styles.darkMuted]}>Tag</Text>
              <View style={styles.chipRow}>
                {tagsForCategory(category).map((t) => (
                  <Pressable key={t} onPress={() => setTag(t)} style={[styles.chip, tag === t && { backgroundColor: accentForeground, borderColor: accentForeground }]}>
                    <Text style={[styles.chipText, isDark && styles.darkMuted, tag === t && { color: onAccent, fontFamily: FONT_SEMI }]}>{t}</Text>
                  </Pressable>
                ))}
              </View>

              <Text style={[styles.label, isDark && styles.darkMuted]}>Notes (optional)</Text>
              <TextInput
                value={notes}
                onChangeText={setNotes}
                placeholder="Thoughts about this resource"
                placeholderTextColor="#9B978F"
                style={[styles.input, styles.notesInput, isDark && styles.inputDark]}
                multiline
                scrollEnabled
                textAlignVertical="top"
              />
            </ScrollView>

            <Pressable disabled={saving} onPress={saveBookmark} style={[styles.saveButton, { backgroundColor: accentForeground }]}>
              <Text style={[styles.saveText, { color: onAccent }]}>{saving ? 'Saving...' : editingId ? 'Update bookmark' : 'Save bookmark'}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Detail modal */}
      <Modal visible={!!detailOpen} transparent animationType="slide" onRequestClose={() => setDetailOpen(null)}>
        <View style={styles.modalShade}>
          <View style={[styles.modalCard, isDark && styles.modalDark]}>
            {detailOpen && (() => {
              const bk = detailOpen;
              return (
                <>
                  <View style={styles.modalTitleRow}>
                    <Text style={[styles.modalTitle, isDark && styles.darkText]} numberOfLines={2}>{bk.title}</Text>
                    <Pressable onPress={() => setDetailOpen(null)}><X color={isDark ? '#F4F2EE' : '#5A5751'} size={21} /></Pressable>
                  </View>

                  <View style={styles.detailSection}>
                    <View style={styles.detailLine}>
                      <Bookmark color={isDark ? '#AAA59D' : '#89857D'} size={16} />
                      <Text style={[styles.detailText, isDark && styles.darkText]}>{bk.category}</Text>
                      <View style={[styles.tagPill, { backgroundColor: accentForeground, marginLeft: 6 }]}>
                        <Text style={[styles.tagPillText, { color: onAccent }]}>{bk.tag}</Text>
                      </View>
                    </View>
                    {bk.url ? (
                      <Pressable onPress={() => openLink(bk.url!)} style={styles.detailLine}>
                        <ExternalLink color={accentForeground} size={16} />
                        <Text style={[styles.detailLink, { color: accentForeground }]} numberOfLines={1}>{bk.url}</Text>
                      </Pressable>
                    ) : null}
                    {bk.notes ? <Text style={[styles.detailNotes, isDark && styles.darkMuted]}>{bk.notes}</Text> : null}
                    <Text style={[styles.detailDate, isDark && styles.darkMuted]}>Saved {new Date(bk.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</Text>
                  </View>

                  <View style={styles.detailActions}>
                    <Pressable onPress={() => openEdit(bk)} style={[styles.detailAction, { backgroundColor: accentForeground }]}>
                      <Pencil color={onAccent} size={16} />
                      <Text style={[styles.detailActionText, { color: onAccent }]}>Edit</Text>
                    </Pressable>
                    {bk.url ? (
                      <Pressable onPress={() => openLink(bk.url!)} style={[styles.detailAction, styles.secondaryAction, isDark && styles.secondaryActionDark]}>
                        <ExternalLink color={accentForeground} size={16} />
                        <Text style={[styles.detailActionText, { color: accentForeground }]}>Open</Text>
                      </Pressable>
                    ) : null}
                    <Pressable onPress={() => deleteBookmark(bk)} style={[styles.detailAction, styles.deleteAction, isDark && styles.deleteActionDark]}>
                      <Trash2 color={isDark ? '#E5A39C' : '#C53A2F'} size={16} />
                      <Text style={styles.deleteText}>Delete</Text>
                    </Pressable>
                  </View>
                </>
              );
            })()}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FBFAF8' },
  safeDark: { backgroundColor: '#090909' },
  darkText: { color: '#F4F2EE' },
  darkMuted: { color: '#AAA59D' },
  error: { fontFamily: FONT_MED, color: '#C53A2F', fontSize: 13, marginBottom: 10 },

  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingTop: 28, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F0EEEA' },
  headerDark: { borderBottomColor: '#262626' },
  backBtn: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontFamily: 'Poppins-ExtraBold', fontSize: 16, letterSpacing: 1.4, color: '#27241F' },
  bellBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  menuShade: { flex: 1, backgroundColor: 'rgba(0,0,0,0.25)', alignItems: 'flex-end', paddingTop: 64, paddingRight: 12 },
  menuCard: { borderRadius: 14, borderWidth: 1, paddingVertical: 6, minWidth: 150, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 4 },
  menuItem: { paddingVertical: 12, paddingHorizontal: 16 },
  menuItemText: { fontFamily: FONT_MED, fontSize: 14 },


  content: { padding: 16, paddingBottom: 90 },

  search: { height: 48, borderRadius: 14, borderWidth: 1, borderColor: '#E1DED8', backgroundColor: '#FFF', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, gap: 10, marginBottom: 4 },
  searchDark: { backgroundColor: '#171717', borderColor: '#363636' },
  searchInput: { flex: 1, fontFamily: FONT, fontSize: 14, color: '#282724' },

  filters: { gap: 8, paddingVertical: 14 },
  filter: { paddingHorizontal: 15, height: 32, borderRadius: 10, borderWidth: 1, borderColor: '#E2DFD9', justifyContent: 'center', backgroundColor: '#FFF' },
  filterDark: { backgroundColor: '#171717', borderColor: '#363636' },
  filterText: { fontFamily: FONT_MED, color: '#77746E', fontSize: 12 },

  tagRow: { gap: 8, paddingBottom: 12 },
  tagChip: { paddingHorizontal: 13, height: 30, borderRadius: 9, borderWidth: 1, borderColor: '#E2DFD9', justifyContent: 'center', backgroundColor: '#FFF' },
  tagChipDark: { backgroundColor: '#171717', borderColor: '#363636' },
  tagChipText: { fontFamily: FONT_MED, color: '#77746E', fontSize: 11 },

  list: { backgroundColor: '#FFF', borderRadius: 18, borderWidth: 1, borderColor: '#ECE9E4', paddingHorizontal: 14 },
  cardDark: { backgroundColor: '#111', borderColor: '#2A2A2A' },
  row: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: '#F0EEEA' },
  rowBorderDark: { borderBottomColor: '#292929' },
  rowIcon: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  rowCopy: { flex: 1, gap: 4 },
  rowTitle: { fontFamily: FONT_MED, fontSize: 15, color: '#27241F' },
  rowMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  rowUrl: { fontFamily: FONT, fontSize: 12, color: '#908B83', maxWidth: '60%' },
  tagPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 7 },
  tagPillText: { fontFamily: FONT_SEMI, fontSize: 10 },

  countRow: { paddingTop: 14, alignItems: 'center' },
  countText: { fontFamily: FONT, fontSize: 12, color: '#908B83' },

  empty: { paddingVertical: 40, alignItems: 'center' },
  emptyText: { fontFamily: FONT, fontSize: 14, color: '#908B83', textAlign: 'center' },

  fab: { position: 'absolute', bottom: 24, alignSelf: 'center', width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },

  modalShade: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  modalCard: { backgroundColor: '#FFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 22, paddingBottom: 34, maxHeight: '92%' },
  modalDark: { backgroundColor: '#161616' },
  modalTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontFamily: FONT_BOLD, fontSize: 18, color: '#27241F', flex: 1, marginRight: 12 },

  label: { fontFamily: FONT_MED, fontSize: 13, color: '#77746E', marginTop: 14, marginBottom: 6 },
  input: { borderWidth: 1, borderColor: '#E1DED8', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, fontFamily: FONT, fontSize: 15, color: '#282724' },
  inputDark: { backgroundColor: '#1E1E1E', borderColor: '#363636', color: '#F4F2EE' },
  notesInput: { minHeight: 100, maxHeight: 160 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: '#E2DFD9', backgroundColor: '#FFF' },
  chipText: { fontFamily: FONT, fontSize: 13, color: '#77746E' },

  saveButton: { borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 22 },
  saveText: { fontFamily: FONT_SEMI, fontSize: 15 },

  detailSection: { marginTop: 8, gap: 12, paddingVertical: 8 },
  detailLine: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  detailText: { fontFamily: FONT_MED, fontSize: 14, color: '#27241F' },
  detailLink: { fontFamily: FONT, fontSize: 13, flex: 1 },
  detailNotes: { fontFamily: FONT, fontSize: 14, color: '#77746E', lineHeight: 20, marginTop: 4 },
  detailDate: { fontFamily: FONT, fontSize: 12, color: '#908B83', marginTop: 4 },
  detailActions: { flexDirection: 'row', gap: 10, marginTop: 20 },
  detailAction: { flex: 1, borderRadius: 14, paddingVertical: 14, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
  secondaryAction: { backgroundColor: '#F5F3EF', borderWidth: 1, borderColor: '#ECE9E4' },
  secondaryActionDark: { backgroundColor: '#1E1E1E', borderColor: '#2A2A2A' },
  deleteAction: { backgroundColor: '#FBEAE8', borderWidth: 1, borderColor: '#F2C8C2' },
  deleteActionDark: { backgroundColor: '#241815', borderColor: '#3A2422' },
  deleteText: { fontFamily: FONT_SEMI, fontSize: 14, color: '#C53A2F' },
  detailActionText: { fontFamily: FONT_SEMI, fontSize: 14 },
});