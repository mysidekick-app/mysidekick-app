import { useCallback, useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Check, ChevronDown, ChevronUp, ChevronLeft, ListChecks, MoreVertical, Plus, Trash2, X } from 'lucide-react-native';
import { router } from 'expo-router';
import { useApp } from '@/components/AppProvider';
import { supabase } from '@/lib/supabase';

type ListItem = {
  id: string;
  title: string;
  completed: boolean;
};

type ListCard = {
  id: string;
  title: string;
  icon: string;
  items: ListItem[];
};

const FONT = 'Poppins-Regular';
const FONT_MED = 'Poppins-Medium';
const FONT_SEMI = 'Poppins-SemiBold';
const FONT_BOLD = 'Poppins-Bold';

export default function ListsScreen() {
  const { accentForeground, accentWash, isDark, onAccent } = useApp();
  const [lists, setLists] = useState<ListCard[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [newListOpen, setNewListOpen] = useState(false);
  const [newListTitle, setNewListTitle] = useState('');
  const [savingList, setSavingList] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const [newItemText, setNewItemText] = useState<Record<string, string>>({});

  const C = isDark
    ? { bg: '#090909', card: '#151515', border: '#2A2A2A', text: '#F4F2EE', muted: '#AAA59D', input: '#1E1E1E', inputBorder: '#363636' }
    : { bg: '#FBFAF8', card: '#FFFFFF', border: '#ECE9E4', text: '#27241F', muted: '#8F8A82', input: '#FCFBF9', inputBorder: '#E0DDD7' };

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: listRows, error: listErr }, { data: itemRows, error: itemErr }] = await Promise.all([
      supabase.from('lists').select('id, title, icon').order('created_at', { ascending: true }),
      supabase.from('list_items').select('id, list_id, title, completed').order('position', { ascending: true }),
    ]);
    if (listErr || itemErr) {
      setError('Your lists could not be loaded.');
    } else {
      const items = (itemRows ?? []) as { id: string; list_id: string; title: string; completed: boolean }[];
      const cards: ListCard[] = ((listRows ?? []) as { id: string; title: string; icon: string }[]).map((l) => ({
        id: l.id,
        title: l.title,
        icon: l.icon,
        items: items.filter((i) => i.list_id === l.id).map((i) => ({ id: i.id, title: i.title, completed: i.completed })),
      }));
      setLists(cards);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const openNewList = () => {
    setNewListTitle('');
    setError(null);
    setNewListOpen(true);
  };

  const saveList = async () => {
    if (!newListTitle.trim()) {
      setError('Give your list a name.');
      return;
    }
    setSavingList(true);
    const { data, error: saveErr } = await supabase
      .from('lists')
      .insert({ title: newListTitle.trim() })
      .select('id, title, icon')
      .maybeSingle();
    if (saveErr || !data) {
      setError('The list could not be saved.');
    } else {
      const created = data as { id: string; title: string; icon: string };
      setLists((c) => [...c, { id: created.id, title: created.title, icon: created.icon, items: [] }]);
      setExpanded((prev) => new Set(prev).add(created.id));
      setNewListOpen(false);
    }
    setSavingList(false);
  };

  const deleteList = async (id: string) => {
    const prev = lists;
    setLists((c) => c.filter((l) => l.id !== id));
    const { error: delErr } = await supabase.from('lists').delete().eq('id', id);
    if (delErr) {
      setError('Could not delete the list.');
      setLists(prev);
    }
  };

  const addItem = async (listId: string) => {
    const text = (newItemText[listId] ?? '').trim();
    if (!text) return;
    const tempId = `temp-${Date.now()}`;
    const newItem: ListItem = { id: tempId, title: text, completed: false };
    setLists((c) => c.map((l) => l.id === listId ? { ...l, items: [...l.items, newItem] } : l));
    setNewItemText((prev) => ({ ...prev, [listId]: '' }));
    const list = lists.find((l) => l.id === listId);
    const nextPosition = list ? list.items.length : 0;
    const { data, error: insErr } = await supabase
      .from('list_items')
      .insert({ list_id: listId, title: text, completed: false, position: nextPosition })
      .select('id, title, completed')
      .maybeSingle();
    if (insErr || !data) {
      setError('Could not add the item.');
      setLists((c) => c.map((l) => l.id === listId ? { ...l, items: l.items.filter((i) => i.id !== tempId) } : l));
    } else {
      const saved = data as { id: string; title: string; completed: boolean };
      setLists((c) => c.map((l) => l.id === listId ? { ...l, items: l.items.map((i) => i.id === tempId ? { id: saved.id, title: saved.title, completed: saved.completed } : i) } : l));
    }
  };

  const toggleItem = async (listId: string, itemId: string) => {
    const list = lists.find((l) => l.id === listId);
    const item = list?.items.find((i) => i.id === itemId);
    if (!item) return;
    const next = !item.completed;
    setLists((c) => c.map((l) => l.id === listId ? { ...l, items: l.items.map((i) => i.id === itemId ? { ...i, completed: next } : i) } : l));
    const { error: updErr } = await supabase.from('list_items').update({ completed: next }).eq('id', itemId);
    if (updErr) {
      setError('Could not update the item.');
      setLists((c) => c.map((l) => l.id === listId ? { ...l, items: l.items.map((i) => i.id === itemId ? { ...i, completed: !next } : i) } : l));
    }
  };

  const deleteItem = async (listId: string, itemId: string) => {
    const prev = lists;
    setLists((c) => c.map((l) => l.id === listId ? { ...l, items: l.items.filter((i) => i.id !== itemId) } : l));
    const { error: delErr } = await supabase.from('list_items').delete().eq('id', itemId);
    if (delErr) {
      setError('Could not delete the item.');
      setLists(prev);
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: C.bg }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: C.border }]}>
        <Pressable onPress={() => router.push('/modules')} style={[styles.headerBack, { backgroundColor: accentForeground }]} hitSlop={12}>
          <ChevronLeft color="#FFFFFF" size={22} strokeWidth={2.4} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: accentForeground }]}>LISTS</Text>
        <Pressable
          onPress={() => setMenuOpen(true)}
          style={styles.headerBtn}
          hitSlop={12}
        >
          <MoreVertical color={C.text} size={22} />
        </Pressable>
      </View>

      <Modal
        visible={menuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuOpen(false)}
      >
        <Pressable
          style={styles.menuShade}
          onPress={() => setMenuOpen(false)}
        >
          <Pressable
            style={[
              styles.menuCard,
              { backgroundColor: C.card, borderColor: C.border },
            ]}
            onPress={(event) => event.stopPropagation()}
          >
            <Pressable
  onPress={() => {
    setMenuOpen(false);
    router.push('/(tabs)/profile');
  }}
  style={styles.menuItem}
>
              <Text style={[styles.menuItemText, { color: C.text }]}>
                Settings
              </Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {error && <Text style={[styles.error, { color: '#C53A2F' }]}>{error}</Text>}

        {loading ? (
          <Text style={[styles.emptyText, { color: C.muted }]}>Loading your lists...</Text>
        ) : lists.length === 0 ? (
          <View style={styles.empty}>
            <Text style={[styles.emptyText, { color: C.muted }]}>No lists yet. Tap the + button to create your first one.</Text>
          </View>
        ) : (
          <View style={styles.listStack}>
            {lists.map((list) => {
              const done = list.items.filter((i) => i.completed).length;
              const total = list.items.length;
              const pct = total ? (done / total) * 100 : 0;
              const isOpen = expanded.has(list.id);
              return (
                <View key={list.id} style={[styles.card, { backgroundColor: C.card, borderColor: C.border }]}>
                  <Pressable onPress={() => toggleExpand(list.id)} style={styles.cardHeader}>
                    <View style={styles.cardHeaderLeft}>
                      <View style={[styles.cardIcon, { backgroundColor: accentWash }]}>
                        <ListChecks color={accentForeground} size={16} strokeWidth={2.2} />
                      </View>
                      <View style={styles.cardHeaderCopy}>
                        <Text style={[styles.cardTitle, { color: C.text }]} numberOfLines={1}>{list.title}</Text>
                        <Text style={[styles.cardMeta, { color: C.muted }]}>{done} of {total} done</Text>
                      </View>
                    </View>
                    <View style={styles.cardHeaderRight}>
                      <View style={[styles.miniProgress, { backgroundColor: isDark ? '#292929' : '#F0EEEA' }]}>
                        <View style={[styles.miniProgressFill, { width: `${pct}%`, backgroundColor: accentForeground }]} />
                      </View>
                      {isOpen ? <ChevronUp color={C.muted} size={18} /> : <ChevronDown color={C.muted} size={18} />}
                    </View>
                  </Pressable>

                  {isOpen && (
                    <View style={styles.cardBody}>
                      {list.items.map((item) => (
                        <View key={item.id} style={[styles.itemRow, { borderBottomColor: isDark ? '#1F1F1F' : '#F5F3EF' }]}>
                          <Pressable
                            onPress={() => toggleItem(list.id, item.id)}
                            style={[styles.itemCheck, item.completed && { backgroundColor: accentForeground, borderColor: accentForeground }]}
                            hitSlop={8}
                          >
                            {item.completed && <Check color={onAccent} size={13} />}
                          </Pressable>
                          <Pressable onPress={() => toggleItem(list.id, item.id)} style={styles.itemCopy} hitSlop={4}>
                            <Text style={[styles.itemText, { color: C.text }, item.completed && styles.itemDone]}>{item.title}</Text>
                          </Pressable>
                          <Pressable onPress={() => deleteItem(list.id, item.id)} hitSlop={8}>
                            <Trash2 color={isDark ? '#444' : '#D8D5CE'} size={15} />
                          </Pressable>
                        </View>
                      ))}

                      <View style={[styles.addItemRow, { borderTopColor: isDark ? '#1F1F1F' : '#F5F3EF' }]}>
                        <Plus color={C.muted} size={16} />
                        <TextInput
                          value={newItemText[list.id] ?? ''}
                          onChangeText={(t) => setNewItemText((prev) => ({ ...prev, [list.id]: t }))}
                          placeholder="Add an item"
                          placeholderTextColor={C.muted}
                          style={[styles.addItemInput, { color: C.text }]}
                          onSubmitEditing={() => addItem(list.id)}
                        />
                        <Pressable onPress={() => addItem(list.id)} style={[styles.addItemBtn, { backgroundColor: accentForeground }]} hitSlop={6}>
                          <Text style={[styles.addItemBtnText, { color: onAccent }]}>Add</Text>
                        </Pressable>
                      </View>

                      <Pressable onPress={() => deleteList(list.id)} style={[styles.deleteListBtn, { borderTopColor: isDark ? '#1F1F1F' : '#F5F3EF' }]} hitSlop={8}>
                        <Trash2 color={C.muted} size={14} />
                        <Text style={[styles.deleteListText, { color: C.muted }]}>Delete list</Text>
                      </Pressable>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* Floating Add Button */}
      <Pressable
        onPress={openNewList}
        style={({ pressed }) => [styles.fab, { backgroundColor: accentForeground }, pressed && { opacity: 0.85 }]}
      >
        <Plus color="#FFFFFF" size={28} strokeWidth={2.6} />
      </Pressable>

      {/* New List Modal */}
      <Modal visible={newListOpen} transparent animationType="slide" onRequestClose={() => setNewListOpen(false)}>
        <View style={styles.modalShade}>
          <View style={[styles.modalCard, { backgroundColor: C.card }]}>
            <View style={styles.modalTitleRow}>
              <Text style={[styles.modalTitle, { color: C.text }]}>New list</Text>
              <Pressable onPress={() => setNewListOpen(false)} hitSlop={12}>
                <X color={C.muted} size={21} />
              </Pressable>
            </View>
            {error && <Text style={[styles.error, { color: '#C53A2F', marginTop: 4 }]}>{error}</Text>}
            <Text style={[styles.label, { color: C.muted }]}>List name</Text>
            <TextInput
              value={newListTitle}
              onChangeText={setNewListTitle}
              placeholder="e.g. Groceries, Packing list"
              placeholderTextColor={C.muted}
              style={[styles.input, { backgroundColor: C.input, borderColor: C.inputBorder, color: C.text }]}
              autoFocus
            />
            <Pressable
              disabled={savingList}
              onPress={saveList}
              style={[styles.saveButton, { backgroundColor: accentForeground }, savingList && { opacity: 0.6 }]}
            >
              <Text style={[styles.saveText, { color: onAccent }]}>{savingList ? 'Saving...' : 'Create list'}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 28,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  headerBack: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  menuShade: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.25)',
    alignItems: 'flex-end',
    paddingTop: 64,
    paddingRight: 12,
  },
  menuCard: {
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 6,
    minWidth: 150,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  menuItem: {
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  menuItemText: {
    fontFamily: FONT_MED,
    fontSize: 14,
  },
  headerTitle: { fontFamily: FONT_BOLD, fontSize: 18, letterSpacing: 1.5 },
  content: { padding: 16, paddingBottom: 80 },
  error: { fontFamily: FONT_MED, fontSize: 13, marginBottom: 10 },
  empty: { paddingVertical: 40, alignItems: 'center' },
  emptyText: { fontFamily: FONT, fontSize: 14, textAlign: 'center' },
  listStack: { gap: 12 },
  card: { borderRadius: 18, borderWidth: 1, overflow: 'hidden' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14 },
  cardHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  cardIcon: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  cardHeaderCopy: { flex: 1, gap: 3 },
  cardTitle: { fontFamily: FONT_MED, fontSize: 15 },
  cardMeta: { fontFamily: FONT, fontSize: 12 },
  cardHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  miniProgress: { width: 60, height: 6, borderRadius: 3, overflow: 'hidden' },
  miniProgressFill: { height: 6, borderRadius: 3 },
  cardBody: { paddingHorizontal: 14, paddingBottom: 14 },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderBottomWidth: 1 },
  itemCheck: { width: 22, height: 22, borderRadius: 7, borderWidth: 1.5, borderColor: '#D8D5CE', alignItems: 'center', justifyContent: 'center' },
  itemCopy: { flex: 1 },
  itemText: { fontFamily: FONT_MED, fontSize: 14 },
  itemDone: { textDecorationLine: 'line-through', opacity: 0.5 },
  addItemRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, paddingTop: 10, borderTopWidth: 1 },
  addItemInput: { flex: 1, fontFamily: FONT, fontSize: 14 },
  addItemBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 9 },
  addItemBtnText: { fontFamily: FONT_SEMI, fontSize: 13 },
  deleteListBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 12, paddingTop: 10, borderTopWidth: 1 },
  deleteListText: { fontFamily: FONT_MED, fontSize: 12 },
  fab: {
    position: 'absolute',
    bottom: 24,
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
  modalShade: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  modalCard: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 22, paddingBottom: 34 },
  modalTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontFamily: FONT_BOLD, fontSize: 18, flex: 1, marginRight: 12 },
  label: { fontFamily: FONT_MED, fontSize: 13, marginTop: 14, marginBottom: 6 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, fontFamily: FONT, fontSize: 15 },
  saveButton: { borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 22 },
  saveText: { fontFamily: FONT_SEMI, fontSize: 15 },
});