import { useCallback, useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Linking, Modal, Platform, Pressable, ScrollView, StatusBar, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Bookmark, ChevronLeft, ExternalLink, Headphones, Film, BookOpen, Folder, MoreVertical, Pencil, Plus, Search, Trash2, X } from 'lucide-react-native';
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

const tagsForCategory = (cat: string): string[] => {
  return CATEGORIES.find((c) => c.label === cat)?.tags ?? [];
};

function getFolderIcon(categoryName: string) {
  switch (categoryName) {
    case 'Videos & Shows':
      return Film;
    case 'Audio':
      return Headphones;
    case 'Written':
      return BookOpen;
    default:
      return Folder;
  }
}

function isAccentBlack(color?: string): boolean {
  if (!color) return false;
  const normalized = color.trim().toLowerCase();
  return (
    normalized === '#000000' ||
    normalized === '#000' ||
    normalized === 'black' ||
    normalized === 'rgb(0,0,0)' ||
    normalized === 'rgba(0,0,0,1)'
  );
}

export default function BookmarksScreen() {
  const { accentForeground, accentColor: rawAccent, isDark } = useApp() as any;
  const pageBg = rawAccent || accentForeground || '#FDE047';
  const isAccentPureBlack = isAccentBlack(pageBg);

  const [bookmarks, setBookmarks] = useState<BookmarkItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [activeFolder, setActiveFolder] = useState<string | null>(null);
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

  const availableTags = useMemo(() => {
    if (!activeFolder) return [];
    return tagsForCategory(activeFolder);
  }, [activeFolder]);

  const filtered = useMemo(() => {
    let items = bookmarks;
    if (activeFolder) {
      items = items.filter((b) => b.category === activeFolder);
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
  }, [bookmarks, activeFolder, selectedTag, query]);

  const handleOpenFolder = (folderName: string) => {
    setActiveFolder(folderName);
    setSelectedTag(null);
  };

  const openNew = () => {
    setEditingId(null);
    setTitle('');
    setUrl('');
    const targetCat = activeFolder || CATEGORIES[0].label;
    setCategory(targetCat);
    const catTags = tagsForCategory(targetCat);
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
    <SafeAreaView style={[styles.safe, { backgroundColor: pageBg }]}>
      <StatusBar
        barStyle={isAccentPureBlack ? 'light-content' : 'dark-content'}
        backgroundColor={pageBg}
      />

      {/* Header */}
      <View style={styles.header}>
        <Pressable
          onPress={() => {
            if (activeFolder) {
              setActiveFolder(null);
              setSelectedTag(null);
            } else {
              router.push('/modules');
            }
          }}
          style={({ pressed }) => [styles.backBtn, pressed && styles.pressedBtn]}
          hitSlop={12}
        >
          <ChevronLeft color="#FFFFFF" size={22} strokeWidth={2.8} />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {activeFolder ? activeFolder.toUpperCase() : 'BOOKMARKS'}
        </Text>
        <Pressable
          onPress={() => setMenuOpen(true)}
          style={({ pressed }) => [styles.bellBtn, pressed && styles.pressedBtn]}
          hitSlop={12}
        >
          <MoreVertical color="#000000" size={22} strokeWidth={2.5} />
        </Pressable>
      </View>

      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <Pressable style={styles.menuShade} onPress={() => setMenuOpen(false)}>
          <Pressable
            style={[styles.menuCard, { backgroundColor: isDark ? '#121212' : '#FFFFFF', borderColor: '#000000' }]}
            onPress={(event) => event.stopPropagation()}
          >
            <Pressable
              onPress={() => {
                setMenuOpen(false);
                router.push('/(tabs)/profile');
              }}
              style={styles.menuItem}
            >
              <Text style={[styles.menuItemText, { color: isDark ? '#FFFFFF' : '#000000' }]}>Settings</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Search bar always white background */}
        <View style={styles.searchWrapper}>
          <View style={styles.searchShadowBackdrop} />
          <View style={[styles.search, { backgroundColor: '#FFFFFF' }]}>
            <Search color="#52525B" size={18} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search bookmarks..."
              placeholderTextColor="#71717A"
              style={[styles.searchInput, { color: '#000000' }]}
            />
          </View>
        </View>

        {error && <Text style={styles.error}>{error}</Text>}

        {/* FOLDERS VIEW (When no folder is selected) */}
        {!activeFolder ? (
          <View style={styles.foldersGrid}>
            {CATEGORIES.map((cat, index) => {
              const count = bookmarks.filter((b) => b.category === cat.label).length;
              const IconComponent = getFolderIcon(cat.label);
              return (
                <View key={cat.label} style={styles.folderCardContainer}>
                  <View style={styles.cardShadowBackdrop} />
                  <Pressable
                    onPress={() => handleOpenFolder(cat.label)}
                    style={({ pressed }) => [
                      styles.folderCard,
                      { backgroundColor: isDark ? '#121212' : '#FFFFFF', borderColor: '#000000' },
                      pressed && styles.pressedBtn,
                    ]}
                  >
                    <View style={styles.folderTop}>
                      <View style={[styles.folderIconWrap, { backgroundColor: pageBg }]}>
                        <IconComponent color="#000000" size={20} strokeWidth={2.4} />
                      </View>
                      <View style={[styles.countBadge, { backgroundColor: pageBg }]}>
                        <Text style={styles.countBadgeText}>{count}</Text>
                      </View>
                    </View>
                    <Text style={[styles.folderTitle, { color: isDark ? pageBg : '#000000' }]} numberOfLines={1}>
                      {cat.label.toUpperCase()}
                    </Text>
                    <Text style={[styles.folderSub, { color: isDark ? '#A1A1AA' : '#52525B' }]} numberOfLines={1}>
                      {cat.tags.join(', ')}
                    </Text>
                  </Pressable>
                </View>
              );
            })}
          </View>
        ) : (
          /* FOLDER DETAIL & SUB-FILTERS VIEW */
          <>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tagRow}>
              <Pressable
                onPress={() => setSelectedTag(null)}
                style={({ pressed }) => [
                  styles.tagChip,
                  {
                    backgroundColor: !selectedTag ? pageBg : (isDark ? '#27272A' : '#F4F4F5'),
                    borderColor: '#000000',
                  },
                  pressed && styles.pressedBtn,
                ]}
              >
                <Text style={[styles.tagChipText, { color: !selectedTag ? '#000000' : (isDark ? '#FFFFFF' : '#000000') }]}>
                  All
                </Text>
              </Pressable>
              {availableTags.map((t) => {
                const isSelected = selectedTag === t;
                return (
                  <Pressable
                    key={t}
                    onPress={() => setSelectedTag(isSelected ? null : t)}
                    style={({ pressed }) => [
                      styles.tagChip,
                      {
                        backgroundColor: isSelected ? pageBg : (isDark ? '#27272A' : '#F4F4F5'),
                        borderColor: '#000000',
                      },
                      pressed && styles.pressedBtn,
                    ]}
                  >
                    <Text style={[styles.tagChipText, { color: isSelected ? '#000000' : (isDark ? '#FFFFFF' : '#000000') }]}>
                      {t}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            {loading ? (
              <Text style={styles.emptyText}>Loading your bookmarks...</Text>
            ) : filtered.length === 0 ? (
              <View style={styles.empty}>
                <Text style={styles.emptyText}>
                  {bookmarks.length === 0 ? 'No bookmarks yet. Tap + to save your first resource.' : 'No bookmarks match this filter.'}
                </Text>
              </View>
            ) : (
              <View style={styles.cardContainer}>
                <View style={styles.cardShadowBackdrop} />
                <View style={[styles.list, { backgroundColor: isDark ? '#121212' : '#FFFFFF', borderColor: '#000000' }]}>
                  {filtered.map((bk, i) => (
                    <Pressable
                      key={bk.id}
                      onPress={() => setDetailOpen(bk)}
                      style={({ pressed }) => [
                        styles.row,
                        i < filtered.length - 1 && [styles.rowBorder, { borderBottomColor: isDark ? '#27272A' : '#E4E4E7' }],
                        pressed && { opacity: 0.7 },
                      ]}
                    >
                      <View style={[styles.rowIcon, { backgroundColor: pageBg }]}>
                        <Bookmark color="#000000" size={18} strokeWidth={2.4} />
                      </View>
                      <View style={styles.rowCopy}>
                        <Text style={[styles.rowTitle, { color: isDark ? '#FFFFFF' : '#000000' }]} numberOfLines={1}>{bk.title}</Text>
                        <View style={styles.rowMeta}>
                          {bk.url ? (
                            <Text style={[styles.rowUrl, { color: isDark ? '#A1A1AA' : '#52525B' }]} numberOfLines={1}>{bk.url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}</Text>
                          ) : null}
                          <View style={[styles.tagPill, { backgroundColor: pageBg }]}>
                            <Text style={styles.tagPillText}>{bk.tag}</Text>
                          </View>
                        </View>
                      </View>
                    </Pressable>
                  ))}
                </View>
              </View>
            )}

            <View style={styles.countRow}>
              <Text style={styles.countText}>
                {filtered.length} bookmark{filtered.length === 1 ? '' : 's'} in {activeFolder}
              </Text>
            </View>
          </>
        )}
      </ScrollView>

      {/* Floating + button */}
      <Pressable
        onPress={openNew}
        style={({ pressed }) => [
          styles.fab,
          { backgroundColor: '#000000', borderWidth: 2, borderColor: pageBg },
          pressed && styles.pressedBtn,
        ]}
        hitSlop={12}
      >
        <Plus color={pageBg} size={28} strokeWidth={2.8} />
      </Pressable>

      {/* Add/Edit modal */}
      <Modal visible={modalOpen} transparent animationType="fade" onRequestClose={() => setModalOpen(false)}>
        <Pressable style={styles.centeredModalBackdrop} onPress={() => setModalOpen(false)}>
          <Pressable
            style={[styles.centeredModalCard, { backgroundColor: isDark ? '#18181B' : '#FFFFFF' }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.modalTitleRow}>
              <Text style={[styles.modalTitle, { color: pageBg }]}>{editingId ? 'Edit bookmark' : 'Save resource'}</Text>
              <Pressable onPress={() => { setModalOpen(false); setEditingId(null); }} hitSlop={12}>
                <X color={isDark ? '#FFFFFF' : '#000000'} size={21} strokeWidth={2.5} />
              </Pressable>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              style={styles.modalScroll}
              contentContainerStyle={styles.modalScrollContent}
              keyboardShouldPersistTaps="handled"
            >
              <Text style={[styles.label, { color: isDark ? '#A1A1AA' : '#52525B' }]}>Title</Text>
              <TextInput
                value={title}
                onChangeText={setTitle}
                placeholder="What are you saving?"
                placeholderTextColor={isDark ? '#71717A' : '#A1A1AA'}
                style={[styles.input, { backgroundColor: isDark ? '#27272A' : '#F4F4F5', borderColor: '#000000', color: isDark ? '#FFFFFF' : '#000000' }]}
                autoFocus
              />

              <Text style={[styles.label, { color: isDark ? '#A1A1AA' : '#52525B' }]}>Link (optional)</Text>
              <TextInput
                value={url}
                onChangeText={setUrl}
                placeholder="https://..."
                placeholderTextColor={isDark ? '#71717A' : '#A1A1AA'}
                style={[styles.input, { backgroundColor: isDark ? '#27272A' : '#F4F4F5', borderColor: '#000000', color: isDark ? '#FFFFFF' : '#000000' }]}
                autoCapitalize="none"
                keyboardType="url"
              />

              <Text style={[styles.label, { color: isDark ? '#A1A1AA' : '#52525B' }]}>Folder / Category</Text>
              <View style={styles.chipRow}>
                {CATEGORIES.map((c) => {
                  const isSelected = category === c.label;
                  return (
                    <Pressable
                      key={c.label}
                      onPress={() => handleCategorySelect(c.label)}
                      style={[
                        styles.chip,
                        {
                          backgroundColor: isSelected ? pageBg : (isDark ? '#27272A' : '#F4F4F5'),
                          borderColor: '#000000',
                        },
                      ]}
                    >
                      <Text style={[styles.chipText, { color: isSelected ? '#000000' : (isDark ? '#FFFFFF' : '#000000') }]}>
                        {c.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={[styles.label, { color: isDark ? '#A1A1AA' : '#52525B' }]}>Sub-Filter / Tag</Text>
              <View style={styles.chipRow}>
                {tagsForCategory(category).map((t) => {
                  const isSelected = tag === t;
                  return (
                    <Pressable
                      key={t}
                      onPress={() => setTag(t)}
                      style={[
                        styles.chip,
                        {
                          backgroundColor: isSelected ? pageBg : (isDark ? '#27272A' : '#F4F4F5'),
                          borderColor: '#000000',
                        },
                      ]}
                    >
                      <Text style={[styles.chipText, { color: isSelected ? '#000000' : (isDark ? '#FFFFFF' : '#000000') }]}>
                        {t}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={[styles.label, { color: isDark ? '#A1A1AA' : '#52525B' }]}>Notes (optional)</Text>
              <TextInput
                value={notes}
                onChangeText={setNotes}
                placeholder="Thoughts about this resource"
                placeholderTextColor={isDark ? '#71717A' : '#A1A1AA'}
                style={[styles.input, styles.notesInput, { backgroundColor: isDark ? '#27272A' : '#F4F4F5', borderColor: '#000000', color: isDark ? '#FFFFFF' : '#000000' }]}
                multiline
                scrollEnabled
                textAlignVertical="top"
              />
            </ScrollView>

            <View style={[styles.saveFooter, { backgroundColor: isDark ? '#18181B' : '#FFFFFF', borderTopColor: '#000000' }]}>
              <Pressable
                disabled={saving}
                onPress={saveBookmark}
                style={({ pressed }) => [
                  styles.saveButton,
                  { backgroundColor: '#000000', borderWidth: 2, borderColor: pageBg },
                  saving && { opacity: 0.6 },
                  pressed && styles.pressedBtn,
                ]}
              >
                <Text style={[styles.saveText, { color: pageBg }]}>
                  {saving ? 'Saving...' : editingId ? 'Update bookmark' : 'Save bookmark'}
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Detail modal */}
      <Modal visible={!!detailOpen} transparent animationType="fade" onRequestClose={() => setDetailOpen(null)}>
        <Pressable style={styles.centeredModalBackdrop} onPress={() => setDetailOpen(null)}>
          <Pressable
            style={[styles.centeredModalCard, { backgroundColor: isDark ? '#18181B' : '#FFFFFF' }]}
            onPress={(e) => e.stopPropagation()}
          >
            {detailOpen && (() => {
              const bk = detailOpen;
              return (
                <>
                  <View style={styles.modalTitleRow}>
                    <Text style={[styles.modalTitle, { color: pageBg }]} numberOfLines={2}>{bk.title}</Text>
                    <Pressable onPress={() => setDetailOpen(null)} hitSlop={12}>
                      <X color={isDark ? '#FFFFFF' : '#000000'} size={21} strokeWidth={2.5} />
                    </Pressable>
                  </View>

                  <View style={styles.detailSection}>
                    <View style={styles.detailLine}>
                      <Bookmark color={isDark ? '#A1A1AA' : '#52525B'} size={18} />
                      <Text style={[styles.detailText, { color: isDark ? '#FFFFFF' : '#000000' }]}>{bk.category}</Text>
                      <View style={[styles.tagPill, { backgroundColor: pageBg, marginLeft: 6 }]}>
                        <Text style={[styles.tagPillText, { color: '#000000' }]}>{bk.tag}</Text>
                      </View>
                    </View>
                    {bk.url ? (
                      <Pressable onPress={() => openLink(bk.url!)} style={styles.detailLine}>
                        <ExternalLink color={pageBg} size={18} />
                        <Text style={[styles.detailLink, { color: pageBg }]} numberOfLines={1}>{bk.url}</Text>
                      </Pressable>
                    ) : null}
                    {bk.notes ? <Text style={[styles.detailNotes, { color: isDark ? '#A1A1AA' : '#52525B' }]}>{bk.notes}</Text> : null}
                    <Text style={[styles.detailDate, { color: isDark ? '#A1A1AA' : '#52525B' }]}>
                      Saved {new Date(bk.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                    </Text>
                  </View>

                  <View style={styles.detailActions}>
                    <Pressable
                      onPress={() => openEdit(bk)}
                      style={({ pressed }) => [
                        styles.detailAction,
                        { backgroundColor: '#000000', borderWidth: 2, borderColor: pageBg },
                        pressed && styles.pressedBtn,
                      ]}
                    >
                      <Pencil color={pageBg} size={16} strokeWidth={2.4} />
                      <Text style={[styles.detailActionText, { color: pageBg }]}>Edit</Text>
                    </Pressable>
                    {bk.url ? (
                      <Pressable
                        onPress={() => openLink(bk.url!)}
                        style={({ pressed }) => [
                          styles.detailAction,
                          { backgroundColor: isDark ? '#27272A' : '#F4F4F5', borderWidth: 2, borderColor: '#000000' },
                          pressed && styles.pressedBtn,
                        ]}
                      >
                        <ExternalLink color={isDark ? '#FFFFFF' : '#000000'} size={16} strokeWidth={2.4} />
                        <Text style={[styles.detailActionText, { color: isDark ? '#FFFFFF' : '#000000' }]}>Open</Text>
                      </Pressable>
                    ) : null}
                    <Pressable
                      onPress={() => deleteBookmark(bk)}
                      style={({ pressed }) => [
                        styles.detailAction,
                        { backgroundColor: isDark ? '#121212' : '#FFFFFF', borderWidth: 2, borderColor: '#EF4444' },
                        pressed && styles.pressedBtn,
                      ]}
                    >
                      <Trash2 color="#EF4444" size={16} strokeWidth={2.4} />
                      <Text style={styles.deleteText}>Delete</Text>
                    </Pressable>
                  </View>
                </>
              );
            })()}
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  pressedBtn: { transform: [{ translateX: 2 }, { translateY: 2 }] },
  error: { fontFamily: 'Poppins-Bold', color: '#EF4444', fontSize: 13, marginBottom: 10 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 10,
    zIndex: 100,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#000000',
  },
  headerTitle: { fontFamily: 'Poppins-ExtraBold', fontSize: 20, letterSpacing: 1, color: '#000000', textAlign: 'center', flex: 1 },
  bellBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  menuShade: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'flex-end', paddingTop: 64, paddingRight: 20 },
  menuCard: { borderRadius: 12, borderWidth: 3, paddingVertical: 6, minWidth: 150 },
  menuItem: { paddingVertical: 12, paddingHorizontal: 16 },
  menuItemText: { fontFamily: 'Poppins-Bold', fontSize: 14 },

  content: { paddingHorizontal: 18, paddingTop: 4, paddingBottom: 90 },

  searchWrapper: { position: 'relative', marginHorizontal: 2, marginBottom: 16, marginTop: 4 },
  searchShadowBackdrop: { position: 'absolute', top: 4, left: 4, right: -4, bottom: -4, backgroundColor: '#000000', borderRadius: 12 },
  search: { height: 48, borderRadius: 12, borderWidth: 2, borderColor: '#000000', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, gap: 10, zIndex: 2 },
  searchInput: { flex: 1, fontFamily: 'Poppins-Medium', fontSize: 14 },

  /* FOLDERS GRID STYLING */
  foldersGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    paddingTop: 4,
  },
  folderCardContainer: {
    width: '48%',
    position: 'relative',
    marginBottom: 16,
  },
  folderCard: {
    borderRadius: 16,
    borderWidth: 3,
    padding: 16,
    minHeight: 140,
    justifyContent: 'space-between',
  },
  folderTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  folderIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#000000',
  },
  countBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: '#000000',
  },
  countBadgeText: {
    fontFamily: 'Poppins-ExtraBold',
    fontSize: 12,
    color: '#000000',
  },
  folderTitle: {
    fontFamily: 'Poppins-ExtraBold',
    fontSize: 16,
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  folderSub: {
    fontFamily: 'Poppins-Medium',
    fontSize: 11,
  },

  tagRow: { gap: 8, paddingBottom: 14 },
  tagChip: { paddingHorizontal: 14, height: 34, borderRadius: 8, borderWidth: 2, justifyContent: 'center', alignItems: 'center' },
  tagChipText: { fontFamily: 'Poppins-Bold', fontSize: 12 },

  cardContainer: { position: 'relative', width: '100%', marginTop: 4 },
  cardShadowBackdrop: { position: 'absolute', top: 4, left: 4, right: -4, bottom: -4, backgroundColor: '#000000', borderRadius: 16 },
  list: { borderRadius: 16, borderWidth: 3, paddingHorizontal: 14 },
  row: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  rowBorder: { borderBottomWidth: 2 },
  rowIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#000000' },
  rowCopy: { flex: 1, gap: 4 },
  rowTitle: { fontFamily: 'Poppins-ExtraBold', fontSize: 15 },
  rowMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  rowUrl: { fontFamily: 'Poppins-Medium', fontSize: 11, maxWidth: '60%' },
  tagPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1, borderColor: '#000000' },
  tagPillText: { fontFamily: 'Poppins-ExtraBold', fontSize: 10, color: '#000000' },

  countRow: { paddingTop: 16, alignItems: 'center' },
  countText: { fontFamily: 'Poppins-Bold', fontSize: 12, color: '#000000' },

  empty: { paddingVertical: 40, alignItems: 'center' },
  emptyText: { fontFamily: 'Poppins-Medium', fontSize: 14, color: '#000000', textAlign: 'center' },

  fab: {
    position: 'absolute',
    bottom: 30,
    alignSelf: 'center',
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },

  centeredModalBackdrop: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.8)', paddingHorizontal: 20 },
  centeredModalCard: { width: '100%', maxWidth: 400, borderRadius: 24, borderWidth: 3, borderColor: '#000000', paddingTop: 22, paddingBottom: 26, paddingHorizontal: 22, maxHeight: '85%', shadowColor: '#000000', shadowOffset: { width: 6, height: 6 }, shadowOpacity: 1, shadowRadius: 0, elevation: 8 },
  modalTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontFamily: 'Poppins-ExtraBold', fontSize: 20, flex: 1, marginRight: 12 },
  keyboardModal: { width: '100%', alignItems: 'center', justifyContent: 'flex-end' },
  modalScroll: { flexGrow: 0, flexShrink: 1 },
  modalScrollContent: { paddingBottom: 8 },

  label: { fontFamily: 'Poppins-Bold', fontSize: 11, letterSpacing: 0.5, marginTop: 12, marginBottom: 6 },
  input: { borderWidth: 2, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontFamily: 'Poppins-Medium', fontSize: 14 },
  notesInput: { minHeight: 90, maxHeight: 140, textAlignVertical: 'top' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, borderWidth: 2 },
  chipText: { fontFamily: 'Poppins-Bold', fontSize: 12 },

  saveFooter: { paddingTop: 12, paddingBottom: 0, borderTopWidth: 2, marginTop: 10 },
  saveButton: { borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 0 },
  saveText: { fontFamily: 'Poppins-ExtraBold', fontSize: 15, letterSpacing: 0.5 },

  detailSection: { marginTop: 8, gap: 12, paddingVertical: 8 },
  detailLine: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  detailText: { fontFamily: 'Poppins-Bold', fontSize: 14 },
  detailLink: { fontFamily: 'Poppins-Medium', fontSize: 13, flex: 1 },
  detailNotes: { fontFamily: 'Poppins-Medium', fontSize: 14, lineHeight: 20, marginTop: 4 },
  detailDate: { fontFamily: 'Poppins-Medium', fontSize: 12, marginTop: 4 },
  detailActions: { flexDirection: 'row', gap: 10, marginTop: 20 },
  detailAction: { flex: 1, borderRadius: 12, paddingVertical: 14, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
  deleteText: { fontFamily: 'Poppins-ExtraBold', fontSize: 14, color: '#EF4444' },
  detailActionText: { fontFamily: 'Poppins-ExtraBold', fontSize: 14 },
});