import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Check,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  List,
  ListChecks,
  ListOrdered,
  MoreVertical,
  Plus,
  Search,
  Trash2,
  Type,
  X,
  AlertTriangle,
} from 'lucide-react-native';
import { router, useNavigation } from 'expo-router';

import { useApp } from '@/components/AppProvider';
import { supabase } from '@/lib/supabase';

/* =========================================================
   FONTS
========================================================= */
const FONT = 'Poppins-Regular';
const FONT_MED = 'Poppins-Medium';
const FONT_SEMI = 'Poppins-SemiBold';
const FONT_BOLD = 'Poppins-Bold';
const PARAGRAPH_MIN_HEIGHT = 120; // Full paragraph height for blank list input area
const PARAGRAPH_MAX_HEIGHT = Math.round(Dimensions.get('window').height * 0.7);

/* =========================================================
   TYPES & FORMAT HELPERS
========================================================= */
export type ListType = 'blank' | 'checklist';
export type BlankFormat = 'paragraph' | 'bullet' | 'numbered';

export type ListItem = {
  id: string;
  title: string;
  completed: boolean;
  format_type?: BlankFormat;
  is_bold?: boolean;
  is_italic?: boolean;
  is_highlighted?: boolean;
  inputHeight?: number;
};

const ITEM_FORMAT_MARKER = '[[SKFMT:';
function encodeItemTitle(title: string, format: BlankFormat): string {
  return format === 'paragraph' ? title : `${ITEM_FORMAT_MARKER}${format}]]${title}`;
}

function decodeItemTitle(storedTitle: string): { title: string; format: BlankFormat } {
  const match = storedTitle.match(/^\[\[SKFMT:(bullet|numbered|paragraph)\]\]/);
  if (!match) return { title: storedTitle, format: 'paragraph' };
  return {
    title: storedTitle.slice(match[0].length),
    format: match[1] as BlankFormat,
  };
}

export type ListCard = {
  id: string;
  title: string;
  icon: string;
  list_type: ListType;
  blank_format?: BlankFormat;
  items: ListItem[];
};

const LIST_TYPES: {
  value: ListType;
  label: string;
  description: string;
}[] = [
  {
    value: 'blank',
    label: 'Blank list',
    description: 'Paragraphs, notes, bullets & numbers',
  },
  {
    value: 'checklist',
    label: 'Checklist',
    description: 'Items you can check off',
  },
];

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

export default function ListsScreen() {
  const navigation = useNavigation();

  useEffect(() => {
    navigation.setOptions({ tabBarStyle: { display: 'none' } });
    return () => {
      navigation.setOptions({ tabBarStyle: undefined });
    };
  }, [navigation]);

  const {
    accentForeground,
    accentColor: rawAccent,
    isDark,
  } = useApp() as any;

  const pageBg = rawAccent || accentForeground || '#FDE047';
  const isAccentPureBlack = isAccentBlack(pageBg);
  const headerTextColor = isAccentPureBlack ? '#FFFFFF' : '#000000';

  const C = isDark
    ? {
        cardBg: '#121212',
        cardText: '#FFFFFF',
        cardSubtext: '#A1A1AA',
        cardBorder: '#000000',
        cardInputBg: '#1E1E1E',
        cardInputBorder: '#333333',
        highlightBg: '#854D0E',
        highlightText: '#FEF08A',
      }
    : {
        cardBg: '#FFFFFF',
        cardText: '#000000',
        cardSubtext: '#52525B',
        cardBorder: '#000000',
        cardInputBg: '#F4F4F5',
        cardInputBorder: '#E4E4E7',
        highlightBg: '#FEF08A',
        highlightText: '#854D0E',
      };

  const [lists, setLists] = useState<ListCard[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [newListOpen, setNewListOpen] = useState(false);
  const [newListTitle, setNewListTitle] = useState('');
  const [newListType, setNewListType] = useState<ListType>('checklist');
  const [savingList, setSavingList] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);

  const [newItemText, setNewItemText] = useState<Record<string, string>>({});
  const [paragraphHeights, setParagraphHeights] = useState<Record<string, number>>({});
  const [addParagraphHeights, setAddParagraphHeights] = useState<Record<string, number>>({});

  const [blankFormatState, setBlankFormatState] = useState<
    Record<string, { format: BlankFormat }>
  >({});

  const [deleteConfirmListId, setDeleteConfirmListId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const [
      { data: listRows, error: listErr },
      { data: itemRows, error: itemErr },
    ] = await Promise.all([
      supabase
        .from('lists')
        .select('id, title, icon, list_type')
        .order('created_at', { ascending: true }),

      supabase
        .from('list_items')
        .select('id, list_id, title, completed, position')
        .order('position', { ascending: true }),
    ]);

    if (listErr || itemErr) {
      setError(`Your lists could not be loaded: ${(listErr ?? itemErr)?.message ?? 'Unknown error'}`);
      setLoading(false);
      return;
    }

    const items = (itemRows ?? []) as any[];

    const cards: ListCard[] = ((listRows ?? []) as any[]).map((list) => {
      const rawType = list.list_type ?? 'checklist';
      const isBlankType = rawType === 'blank' || rawType === 'bullet' || rawType === 'numbered';

      return {
        id: list.id,
        title: list.title,
        icon: list.icon ?? '',
        list_type: isBlankType ? 'blank' : 'checklist',
        blank_format: (() => {
          const listItems = items.filter((item) => item.list_id === list.id);
          const storedFormat = listItems
            .map((item) => decodeItemTitle(item.title ?? '').format)
            .find((format) => format !== 'paragraph');
          return rawType === 'bullet'
            ? 'bullet'
            : rawType === 'numbered'
              ? 'numbered'
              : storedFormat ?? 'paragraph';
        })(),
        items: items
          .filter((item) => item.list_id === list.id)
          .map((item) => {
            const decoded = decodeItemTitle(item.title ?? '');
            return {
              id: item.id,
              title: decoded.title,
              completed: Boolean(item.completed),
              format_type: decoded.format,
              is_bold: false,
              is_italic: false,
            };
          }),
      };
    });

    setLists(cards);

    const initFormats: Record<string, any> = {};
    cards.forEach((c) => {
      initFormats[c.id] = {
        format: c.blank_format || 'paragraph',
      };
    });
    setBlankFormatState(initFormats);

    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filteredLists = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return lists;

    return lists.filter((list) => {
      const titleMatch = list.title.toLowerCase().includes(query);
      const typeMatch = (list.list_type === 'blank' ? 'Blank list' : 'Checklist').toLowerCase().includes(query);
      const itemMatch = list.items.some((item) => item.title.toLowerCase().includes(query));

      return titleMatch || typeMatch || itemMatch;
    });
  }, [lists, searchQuery]);

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
    setNewListType('checklist');
    setError(null);
    setNewListOpen(true);
  };

  const saveList = async () => {
    if (!newListTitle.trim()) {
      setError('Give your list a name.');
      return;
    }

    setSavingList(true);
    setError(null);

    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user) {
        setError('You must be logged in to create a list.');
        setSavingList(false);
        return;
      }

      const { data, error: saveErr } = await supabase
        .from('lists')
        .insert({
          user_id: user.id,
          title: newListTitle.trim(),
          list_type: newListType,
        })
        .select('id, title, icon, list_type')
        .maybeSingle();

      if (saveErr || !data) {
        setError('The list could not be saved.');
        setSavingList(false);
        return;
      }

      const created = data as any;
      const newListObj: ListCard = {
        id: created.id,
        title: created.title,
        icon: created.icon ?? '',
        list_type: created.list_type === 'blank' ? 'blank' : 'checklist',
        blank_format: 'paragraph',
        items: [],
      };

      setLists((current) => [...current, newListObj]);
      setBlankFormatState((prev) => ({
        ...prev,
        [created.id]: {
          format: 'paragraph',
        },
      }));

      setExpanded((prev) => {
        const next = new Set(prev);
        next.add(created.id);
        return next;
      });

      setNewListOpen(false);
      setNewListTitle('');
      setNewListType('checklist');
    } catch {
      setError('Something went wrong while creating the list.');
    } finally {
      setSavingList(false);
    }
  };

  const confirmDeleteList = (id: string) => {
    setDeleteConfirmListId(id);
  };

  const handleExecuteDeleteList = async () => {
    if (!deleteConfirmListId) return;
    const id = deleteConfirmListId;
    setDeleteConfirmListId(null);

    const previous = lists;
    setLists((current) => current.filter((list) => list.id !== id));

    setExpanded((current) => {
      const next = new Set(current);
      next.delete(id);
      return next;
    });

    const { error: deleteError } = await supabase.from('lists').delete().eq('id', id);

    if (deleteError) {
      setError('Could not delete the list.');
      setLists(previous);
    }
  };

  const updateBlankFormat = (listId: string, key: 'format', value: any) => {
    const selectedFormat = value as BlankFormat;
    const targetList = lists.find((list) => list.id === listId && list.list_type === 'blank');

    setBlankFormatState((prev) => ({
      ...prev,
      [listId]: {
        ...(prev[listId] || { format: 'paragraph' }),
        format: selectedFormat,
      },
    }));

    setLists((current) =>
      current.map((list) =>
        list.id === listId && list.list_type === 'blank'
          ? {
              ...list,
              blank_format: selectedFormat,
              items: list.items.map((item) => ({ ...item, format_type: selectedFormat })),
            }
          : list,
      ),
    );

    if (targetList) {
      void Promise.all(
        targetList.items.map(async (item) => {
          await supabase
            .from('list_items')
            .update({ title: encodeItemTitle(item.title, selectedFormat) })
            .eq('id', item.id);
        }),
      );
    }
  };

  const handleItemTextChange = (listId: string, itemId: string, text: string) => {
    setLists((current) =>
      current.map((list) => {
        if (list.id !== listId) return list;
        return {
          ...list,
          items: list.items.map((item) =>
            item.id === itemId
              ? {
                  ...item,
                  title: text,
                }
              : item,
          ),
        };
      }),
    );
  };

  const handleItemContentSizeChange = (itemId: string, height: number) => {
    const clampedHeight = Math.max(PARAGRAPH_MIN_HEIGHT, Math.ceil(height) + 4);
    setParagraphHeights((previous) => {
      if (previous[itemId] === clampedHeight) return previous;
      return { ...previous, [itemId]: clampedHeight };
    });
  };

  const handleAddContentSizeChange = (listId: string, height: number) => {
    const clampedHeight = Math.max(PARAGRAPH_MIN_HEIGHT, Math.ceil(height) + 4);
    setAddParagraphHeights((previous) => {
      if (previous[listId] === clampedHeight) return previous;
      return { ...previous, [listId]: clampedHeight };
    });
  };

  const handleItemTextBlur = async (listId: string, itemId: string, text: string) => {
    const list = lists.find((l) => l.id === listId);
    const item = list?.items.find((i) => i.id === itemId);
    if (!item) return;

    const fmt = list?.blank_format || item.format_type || 'paragraph';
    const encodedTitle = encodeItemTitle(text, fmt);

    await supabase
      .from('list_items')
      .update({ title: encodedTitle })
      .eq('id', itemId);
  };

  const addItem = async (listId: string, initialText?: string) => {
    const rawText = initialText !== undefined ? initialText : newItemText[listId] ?? '';
    const text = rawText.trim();

    if (initialText === undefined && !text) return;

    const list = lists.find((item) => item.id === listId);
    if (!list) return;

    const fmt = blankFormatState[listId] || {
      format: 'paragraph',
    };

    if (list.list_type === 'blank' && fmt.format === 'paragraph') {
      const hasParagraph = list.items.some(
        (item) => (item.format_type || 'paragraph') === 'paragraph'
      );
      if (hasParagraph) {
        setError('A blank list can only contain one paragraph.');
        return;
      }
    }

    const currentInputHeight = addParagraphHeights[listId] ?? PARAGRAPH_MIN_HEIGHT;

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      setError('You must be logged in to add an item.');
      return;
    }

    const tempId = `temp-${Date.now()}`;
    const newItem: ListItem = {
      id: tempId,
      title: text,
      completed: false,
      format_type: list.list_type === 'blank' ? fmt.format : undefined,
      inputHeight: currentInputHeight,
    };

    setLists((current) =>
      current.map((item) =>
        item.id === listId
          ? {
              ...item,
              items: [...item.items, newItem],
            }
          : item,
      ),
    );

    if (initialText === undefined) {
      setNewItemText((previous) => ({
        ...previous,
        [listId]: '',
      }));
      setAddParagraphHeights((previous) => ({
        ...previous,
        [listId]: PARAGRAPH_MIN_HEIGHT,
      }));
    }

    const nextPosition = list.items.length;

    const { data, error: insertError } = await supabase
      .from('list_items')
      .insert({
        user_id: user.id,
        list_id: listId,
        title: encodeItemTitle(text, newItem.format_type || 'paragraph'),
        completed: false,
        position: nextPosition,
      })
      .select('id, title, completed')
      .maybeSingle();

    if (insertError || !data) {
      setError(`Could not add the item: ${insertError?.message ?? 'Unknown error'}`);
      setLists((current) =>
        current.map((item) =>
          item.id === listId
            ? {
                ...item,
                items: item.items.filter((entry) => entry.id !== tempId),
              }
            : item,
        ),
      );
      return;
    }

    const saved = data as any;
    setLists((current) =>
      current.map((item) =>
        item.id === listId
          ? {
              ...item,
              items: item.items.map((entry) =>
                entry.id === tempId
                  ? {
                      ...newItem,
                      id: saved.id,
                      title: text,
                      completed: Boolean(saved.completed),
                    }
                  : entry,
              ),
            }
          : item,
      ),
    );

    setParagraphHeights((previous) => ({
      ...previous,
      [saved.id]: currentInputHeight,
    }));
  };

  const toggleItem = async (listId: string, itemId: string) => {
    const list = lists.find((item) => item.id === listId);
    if (!list || list.list_type !== 'checklist') return;

    const item = list.items.find((entry) => entry.id === itemId);
    if (!item) return;

    const next = !item.completed;

    setLists((current) =>
      current.map((itemList) =>
        itemList.id === listId
          ? {
              ...itemList,
              items: itemList.items.map((entry) =>
                entry.id === itemId
                  ? {
                      ...entry,
                      completed: next,
                    }
                  : entry,
              ),
            }
          : itemList,
      ),
    );

    await supabase.from('list_items').update({ completed: next }).eq('id', itemId);
  };

  const deleteItem = async (listId: string, itemId: string) => {
    const previous = lists;

    setLists((current) =>
      current.map((list) =>
        list.id === listId
          ? {
              ...list,
              items: list.items.filter((item) => item.id !== itemId),
            }
          : list,
      ),
    );

    const { error: deleteError } = await supabase.from('list_items').delete().eq('id', itemId);

    if (deleteError) {
      setError('Could not delete the item.');
      setLists(previous);
    }
  };

  const renderItemPrefix = (list: ListCard, item: ListItem, index: number) => {
    if (list.list_type === 'checklist') {
      return (
        <Pressable
          onPress={() => toggleItem(list.id, item.id)}
          style={[
            styles.itemCheck,
            { borderColor: C.cardText },
            item.completed && {
              backgroundColor: '#000000',
              borderColor: '#000000',
            },
          ]}
          hitSlop={8}
        >
          {item.completed && <Check color="#FFFFFF" size={13} strokeWidth={3} />}
        </Pressable>
      );
    }

    const fmtType = list.blank_format || item.format_type || 'paragraph';

    if (fmtType === 'bullet') {
      return (
        <View style={styles.bulletPrefix}>
          <Text style={[styles.bulletText, { color: C.cardText }]}>•</Text>
        </View>
      );
    }

    if (fmtType === 'numbered') {
      return (
        <View style={styles.numberPrefix}>
          <Text style={[styles.numberText, { color: C.cardText }]}>{index + 1}.</Text>
        </View>
      );
    }

    return null;
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: pageBg }]}>
      <StatusBar
        barStyle={isAccentPureBlack ? 'light-content' : 'dark-content'}
        backgroundColor={pageBg}
      />

      <View style={styles.header}>
        <Pressable
          onPress={() => router.push('/modules')}
          style={({ pressed }) => [
            styles.headerBack,
            pressed && styles.pressedBtn,
          ]}
          hitSlop={12}
        >
          <ChevronLeft color="#FFFFFF" size={22} strokeWidth={2.8} />
        </Pressable>

        <Text style={[styles.headerTitle, { color: headerTextColor }]}>
          LISTS
        </Text>

        <Pressable
          onPress={() => setMenuOpen(true)}
          style={({ pressed }) => [
            styles.headerBtn,
            pressed && styles.pressedBtn,
          ]}
          hitSlop={12}
        >
          <MoreVertical color={headerTextColor} size={24} strokeWidth={2.5} />
        </Pressable>
      </View>

      <View style={styles.searchWrap}>
        <View style={styles.shadowBackdrop} />
        <View style={styles.searchBoxBody}>
          <Search color="#000000" size={18} strokeWidth={2.5} />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search lists..."
            placeholderTextColor="#71717A"
            style={styles.searchInput}
            returnKeyType="search"
          />
          {searchQuery.length > 0 && (
            <Pressable onPress={() => setSearchQuery('')} hitSlop={10}>
              <X color="#000000" size={18} strokeWidth={2.5} />
            </Pressable>
          )}
        </View>
      </View>

      <Modal
        visible={menuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuOpen(false)}
      >
        <Pressable style={styles.menuShade} onPress={() => setMenuOpen(false)}>
          <View style={styles.menuCardWrapper}>
            <View style={styles.shadowBackdrop} />
            <View style={[styles.menuCardBody, { backgroundColor: C.cardBg }]}>
              <Pressable
                onPress={() => {
                  setMenuOpen(false);
                  router.push('/(tabs)/profile');
                }}
                style={styles.menuItem}
              >
                <Text style={[styles.menuItemText, { color: C.cardText }]}>
                  Settings
                </Text>
              </Pressable>
            </View>
          </View>
        </Pressable>
      </Modal>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {loading ? (
          <Text style={[styles.emptyText, { color: headerTextColor }]}>
            Loading your lists...
          </Text>
        ) : lists.length === 0 ? (
          <View style={styles.empty}>
            <Text style={[styles.emptyText, { color: headerTextColor }]}>
              No lists yet. Tap the + button below to create one!
            </Text>
          </View>
        ) : filteredLists.length === 0 ? (
          <View style={styles.empty}>
            <Text style={[styles.emptyText, { color: headerTextColor }]}>
              No lists match "{searchQuery}"
            </Text>
          </View>
        ) : (
          <View style={styles.listStack}>
            {filteredLists.map((list) => {
              const isChecklist = list.list_type === 'checklist';
              const isBlank = list.list_type === 'blank';

              const doneCount = isChecklist
                ? list.items.filter((item) => item.completed).length
                : 0;
              const totalCount = list.items.length;
              const pct = isChecklist && totalCount > 0 ? (doneCount / totalCount) * 100 : 0;

              const isOpen = expanded.has(list.id);
              const currentInput = newItemText[list.id] ?? '';

              const activeToolbar = blankFormatState[list.id] || {
                format: list.blank_format || 'paragraph',
              };

              const isItemizedFormat =
                isChecklist || activeToolbar.format === 'numbered' || activeToolbar.format === 'bullet';

              const hasExistingParagraph =
                isBlank &&
                activeToolbar.format === 'paragraph' &&
                list.items.some((item) => (item.format_type || 'paragraph') === 'paragraph');

              return (
                <View key={list.id} style={styles.cardContainer}>
                  <View style={styles.cardShadowBackdrop} />

                  <View
                    style={[
                      styles.cardBody,
                      {
                        backgroundColor: C.cardBg,
                        borderColor: C.cardBorder,
                      },
                    ]}
                  >
                    <Pressable
                      onPress={() => toggleExpand(list.id)}
                      style={styles.cardHeader}
                    >
                      <View style={styles.cardHeaderLeft}>
                        <View style={[styles.cardIconBox, { backgroundColor: pageBg }]}>
                          <ListChecks color="#000000" size={18} strokeWidth={2.5} />
                        </View>

                        <View style={styles.cardHeaderCopy}>
                          <Text
                            style={[styles.cardTitle, { color: C.cardText }]}
                            numberOfLines={1}
                          >
                            {list.title}
                          </Text>

                          <Text style={[styles.cardMeta, { color: C.cardSubtext }]}>
                            {isBlank ? 'Blank list' : 'Checklist'}
                            {isChecklist
                              ? ` • ${doneCount} of ${totalCount} done`
                              : totalCount > 0
                              ? ` • ${totalCount} note${totalCount === 1 ? '' : 's'}`
                              : ''}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.cardHeaderRight}>
                        {isChecklist && (
                          <View style={styles.miniProgressTrack}>
                            <View
                              style={[
                                styles.miniProgressFill,
                                { width: `${pct}%`, backgroundColor: pageBg },
                              ]}
                            />
                          </View>
                        )}

                        {isOpen ? (
                          <ChevronUp color={C.cardText} size={20} strokeWidth={2.5} />
                        ) : (
                          <ChevronDown color={C.cardText} size={20} strokeWidth={2.5} />
                        )}
                      </View>
                    </Pressable>

                    {isOpen && (
                      <View style={styles.cardExpandedContent}>
                        {isBlank && (
                          <View
                            style={[
                              styles.blankToolbar,
                              {
                                backgroundColor: C.cardInputBg,
                                borderColor: C.cardInputBorder,
                              },
                            ]}
                          >
                            <View style={styles.toolbarGroup}>
                              <Pressable
                                onPress={() => updateBlankFormat(list.id, 'format', 'paragraph')}
                                style={[
                                  styles.toolbarBtn,
                                  activeToolbar.format === 'paragraph' && styles.toolbarBtnActive,
                                ]}
                              >
                                <Type
                                  size={15}
                                  color={activeToolbar.format === 'paragraph' ? '#FFFFFF' : C.cardText}
                                  strokeWidth={2.5}
                                />
                              </Pressable>

                              <Pressable
                                onPress={() => updateBlankFormat(list.id, 'format', 'numbered')}
                                style={[
                                  styles.toolbarBtn,
                                  activeToolbar.format === 'numbered' && styles.toolbarBtnActive,
                                ]}
                              >
                                <ListOrdered
                                  size={15}
                                  color={activeToolbar.format === 'numbered' ? '#FFFFFF' : C.cardText}
                                  strokeWidth={2.5}
                                />
                              </Pressable>

                              <Pressable
                                onPress={() => updateBlankFormat(list.id, 'format', 'bullet')}
                                style={[
                                  styles.toolbarBtn,
                                  activeToolbar.format === 'bullet' && styles.toolbarBtnActive,
                                ]}
                              >
                                <List
                                  size={15}
                                  color={activeToolbar.format === 'bullet' ? '#FFFFFF' : C.cardText}
                                  strokeWidth={2.5}
                                />
                              </Pressable>
                            </View>
                          </View>
                        )}

                        {list.items.map((item, index) => {
                          const currentSavedHeight =
                            paragraphHeights[item.id] ?? item.inputHeight ?? PARAGRAPH_MIN_HEIGHT;
                          const isParagraphItem =
                            isBlank && (item.format_type || 'paragraph') === 'paragraph';

                          return (
                            <View
                              key={item.id}
                              style={[
                                styles.itemRow,
                                { borderBottomColor: C.cardInputBorder },
                              ]}
                            >
                              {renderItemPrefix(list, item, index)}

                              <View style={styles.itemCopy}>
                                {isItemizedFormat || isBlank ? (
                                  <TextInput
                                    value={item.title}
                                    onChangeText={(text) => handleItemTextChange(list.id, item.id, text)}
                                    onContentSizeChange={(e) => {
                                      if (isParagraphItem) {
                                        handleItemContentSizeChange(item.id, e.nativeEvent.contentSize.height);
                                      }
                                    }}
                                    onBlur={() => handleItemTextBlur(list.id, item.id, item.title)}
                                    style={[
                                      styles.itemInputInline,
                                      { color: C.cardText },
                                      isParagraphItem && {
                                        flex: 0,
                                        flexGrow: 0,
                                        flexShrink: 0,
                                        height: currentSavedHeight,
                                        backgroundColor: C.cardInputBg,
                                        borderColor: C.cardInputBorder,
                                        borderWidth: 2,
                                        borderRadius: 8,
                                        paddingHorizontal: 12,
                                        paddingVertical: 10,
                                      },
                                      isChecklist && item.completed && styles.itemDone,
                                    ]}
                                    multiline={!isItemizedFormat}
                                    scrollEnabled={false}
                                    textAlignVertical={!isItemizedFormat ? 'top' : 'center'}
                                  />
                                ) : (
                                  <Text
                                    style={[
                                      styles.itemText,
                                      { color: C.cardText },
                                      isChecklist && item.completed && styles.itemDone,
                                    ]}
                                  >
                                    {item.title}
                                  </Text>
                                )}
                              </View>

                              {/* Only show delete trash button for bullet and numbered list items or checklists */}
                              {(!isBlank || !isParagraphItem) && (
                                <Pressable
                                  onPress={() => deleteItem(list.id, item.id)}
                                  style={styles.itemDeleteBtn}
                                  hitSlop={8}
                                >
                                  <Trash2 color={C.cardSubtext} size={15} strokeWidth={2} />
                                </Pressable>
                              )}
                            </View>
                          );
                        })}

                        {!hasExistingParagraph && (
                          <View style={styles.addItemRow}>
                            {isItemizedFormat && (
                              <View style={styles.addItemPrefixBox}>
                                {activeToolbar.format === 'bullet' ? (
                                  <Text style={[styles.bulletText, { color: C.cardSubtext }]}>•</Text>
                                ) : activeToolbar.format === 'numbered' ? (
                                  <Text style={[styles.numberText, { color: C.cardSubtext }]}>
                                    {list.items.length + 1}.
                                  </Text>
                                ) : null}
                              </View>
                            )}

                            {(() => {
                              const currentAddHeight = addParagraphHeights[list.id] ?? PARAGRAPH_MIN_HEIGHT;
                              const isAddingParagraph = isBlank && activeToolbar.format === 'paragraph';

                              return (
                                <TextInput
                                  value={currentInput}
                                  onChangeText={(text) => {
                                    setNewItemText((prev) => ({ ...prev, [list.id]: text }));
                                  }}
                                  onContentSizeChange={(e) => {
                                    if (isAddingParagraph) {
                                      handleAddContentSizeChange(list.id, e.nativeEvent.contentSize.height);
                                    }
                                  }}
                                  placeholder={
                                    activeToolbar.format === 'numbered'
                                      ? 'Add numbered item...'
                                      : activeToolbar.format === 'bullet'
                                      ? 'Add bullet item...'
                                      : isBlank
                                      ? 'Add paragraph or note...'
                                      : 'Add checklist item...'
                                  }
                                  placeholderTextColor={C.cardSubtext}
                                  multiline={!isItemizedFormat}
                                  style={[
                                    styles.addItemInput,
                                    {
                                      backgroundColor: C.cardInputBg,
                                      borderColor: C.cardInputBorder,
                                      color: C.cardText,
                                    },
                                    isAddingParagraph && [
                                      styles.blankInputBox,
                                      {
                                        height: currentAddHeight,
                                      },
                                    ],
                                  ]}
                                  scrollEnabled={false}
                                  textAlignVertical={!isItemizedFormat ? 'top' : 'center'}
                                />
                              );
                            })()}

                            <Pressable
                              onPress={() => addItem(list.id)}
                              style={({ pressed }) => [
                                styles.addItemBtn,
                                pressed && styles.pressedBtn,
                              ]}
                            >
                              <Text style={styles.addItemBtnText}>Add</Text>
                            </Pressable>
                          </View>
                        )}

                        <Pressable
                          onPress={() => confirmDeleteList(list.id)}
                          style={styles.deleteListRowBtn}
                          hitSlop={8}
                        >
                          <Trash2 color="#EF4444" size={14} strokeWidth={2.2} />
                          <Text style={styles.deleteListText}>Delete list</Text>
                        </Pressable>
                      </View>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      <View style={styles.fabContainer}>
        <View style={styles.fabShadowBackdrop} />
        <Pressable
          onPress={openNewList}
          style={({ pressed }) => [styles.fabBtn, pressed && styles.pressedBtn]}
        >
          <Plus color="#FFFFFF" size={28} strokeWidth={3} />
        </Pressable>
      </View>

      <Modal
        visible={newListOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setNewListOpen(false)}
      >
        <KeyboardAvoidingView
          style={styles.keyboardAvoidingView}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.modalShade}>
            <View style={styles.modalCardWrapper}>
              <View style={styles.modalShadowBackdrop} />
              <View style={[styles.modalCardBody, { backgroundColor: C.cardBg }]}>
                <View style={styles.modalTitleRow}>
                  <Text style={[styles.modalTitle, { color: C.cardText }]}>
                    New list
                  </Text>
                  <Pressable onPress={() => setNewListOpen(false)} hitSlop={12}>
                    <X color={C.cardText} size={22} strokeWidth={2.5} />
                  </Pressable>
                </View>

                <ScrollView
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="always"
                >
                  {error && <Text style={styles.modalError}>{error}</Text>}

                  <Text style={[styles.inputLabel, { color: C.cardSubtext }]}>
                    LIST TITLE
                  </Text>
                  <TextInput
                    value={newListTitle}
                    onChangeText={setNewListTitle}
                    placeholder="e.g. Daily Reflection, Groceries"
                    placeholderTextColor={C.cardSubtext}
                    style={[
                      styles.modalTextInput,
                      {
                        backgroundColor: C.cardInputBg,
                        borderColor: C.cardInputBorder,
                        color: C.cardText,
                      },
                    ]}
                    autoFocus
                  />

                  <Text style={[styles.inputLabel, { color: C.cardSubtext }]}>
                    LIST TYPE
                  </Text>
                  <View style={styles.typeOptionsStack}>
                    {LIST_TYPES.map((type) => {
                      const selected = newListType === type.value;
                      return (
                        <Pressable
                          key={type.value}
                          onPress={() => setNewListType(type.value)}
                          style={[
                            styles.typeOptionCard,
                            {
                              backgroundColor: selected ? pageBg : C.cardInputBg,
                              borderColor: '#000000',
                            },
                          ]}
                        >
                          <View style={styles.typeOptionLeft}>
                            <Text
                              style={[
                                styles.typeOptionTitle,
                                { color: selected ? '#000000' : C.cardText },
                              ]}
                            >
                              {type.label}
                            </Text>
                            <Text
                              style={[
                                styles.typeOptionSub,
                                { color: selected ? '#18181B' : C.cardSubtext },
                              ]}
                            >
                              {type.description}
                            </Text>
                          </View>
                          <View
                            style={[
                              styles.radioCircle,
                              { borderColor: '#000000' },
                            ]}
                          >
                            {selected && <View style={styles.radioInner} />}
                          </View>
                        </Pressable>
                      );
                    })}
                  </View>
                </ScrollView>

                <Pressable
                  disabled={savingList}
                  onPress={saveList}
                  style={({ pressed }) => [
                    styles.createListBtn,
                    pressed && styles.pressedBtn,
                    savingList && { opacity: 0.6 },
                  ]}
                >
                  <Text style={styles.createListBtnText}>
                    {savingList ? 'Creating...' : 'Create List'}
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={Boolean(deleteConfirmListId)}
        transparent
        animationType="fade"
        onRequestClose={() => setDeleteConfirmListId(null)}
      >
        <View style={styles.alertShade}>
          <View style={styles.alertCardWrapper}>
            <View style={styles.alertShadowBackdrop} />
            <View style={styles.alertCardBody}>
              <View style={styles.alertHeaderRow}>
                <View style={styles.alertIconBadge}>
                  <AlertTriangle color="#000000" size={20} strokeWidth={2.5} />
                </View>
                <Text style={styles.alertTitle}>Delete List?</Text>
              </View>

              <Text style={styles.alertMessage}>
                Are you sure you want to delete this list? This action cannot be undone.
              </Text>

              <View style={styles.alertActionsRow}>
                <Pressable
                  onPress={() => setDeleteConfirmListId(null)}
                  style={({ pressed }) => [
                    styles.alertCancelBtn,
                    pressed && styles.pressedBtn,
                  ]}
                >
                  <Text style={styles.alertCancelText}>Cancel</Text>
                </Pressable>

                <Pressable
                  onPress={handleExecuteDeleteList}
                  style={({ pressed }) => [
                    styles.alertDeleteBtn,
                    pressed && styles.pressedBtn,
                  ]}
                >
                  <Text style={styles.alertDeleteText}>Delete</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  pressedBtn: {
    transform: [{ translateX: 2 }, { translateY: 2 }],
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 12,
  },
  headerBack: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: '#000000',
    borderWidth: 2,
    borderColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontFamily: FONT_BOLD,
    fontSize: 22,
    letterSpacing: 1,
  },
  headerBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchWrap: {
    marginHorizontal: 18,
    marginTop: 6,
    marginBottom: 10,
    position: 'relative',
    height: 48,
  },
  shadowBackdrop: {
    position: 'absolute',
    top: 4,
    left: 4,
    right: -4,
    bottom: -4,
    backgroundColor: '#000000',
    borderRadius: 12,
  },
  searchBoxBody: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 48,
    backgroundColor: '#FFFFFF',
    borderWidth: 2.5,
    borderColor: '#000000',
    borderRadius: 12,
    paddingHorizontal: 12,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontFamily: FONT_MED,
    fontSize: 14,
    color: '#000000',
    paddingVertical: 0,
  },
  menuShade: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'flex-end',
    paddingTop: 60,
    paddingRight: 20,
  },
  menuCardWrapper: {
    position: 'relative',
    width: 160,
  },
  menuCardBody: {
    borderRadius: 12,
    borderWidth: 2.5,
    borderColor: '#000000',
    paddingVertical: 4,
  },
  menuItem: {
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  menuItemText: {
    fontFamily: FONT_BOLD,
    fontSize: 14,
  },
  content: {
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 120,
  },
  errorBox: {
    backgroundColor: '#FEE2E2',
    borderWidth: 2.5,
    borderColor: '#000000',
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
  },
  errorText: {
    fontFamily: FONT_BOLD,
    color: '#DC2626',
    fontSize: 13,
  },
  empty: {
    paddingVertical: 50,
    alignItems: 'center',
  },
  emptyText: {
    fontFamily: FONT_BOLD,
    fontSize: 15,
    textAlign: 'center',
  },
  listStack: {
    gap: 16,
  },
  cardContainer: {
    position: 'relative',
    marginTop: 4,
  },
  cardShadowBackdrop: {
    position: 'absolute',
    top: 5,
    left: 5,
    right: -5,
    bottom: -5,
    backgroundColor: '#000000',
    borderRadius: 16,
  },
  cardBody: {
    borderRadius: 16,
    borderWidth: 3,
    padding: 14,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  cardIconBox: {
    width: 36,
    height: 36,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardHeaderCopy: {
    flex: 1,
  },
  cardTitle: {
    fontFamily: FONT_BOLD,
    fontSize: 16,
  },
  cardMeta: {
    fontFamily: FONT_MED,
    fontSize: 11,
  },
  cardHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  miniProgressTrack: {
    width: 50,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#000000',
    overflow: 'hidden',
  },
  miniProgressFill: {
    height: '100%',
  },
  cardExpandedContent: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 2,
    borderTopColor: '#000000',
  },
  blankToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 6,
    borderRadius: 10,
    borderWidth: 2,
    marginBottom: 12,
  },
  toolbarGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  toolbarBtn: {
    width: 30,
    height: 30,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolbarBtnActive: {
    backgroundColor: '#000000',
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    paddingVertical: 6,
    borderBottomWidth: 1,
  },
  itemCheck: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bulletPrefix: {
    width: 14,
    alignItems: 'center',
  },
  bulletText: {
    fontFamily: FONT_BOLD,
    fontSize: 20,
  },
  numberPrefix: {
    width: 18,
    alignItems: 'flex-start',
  },
  numberText: {
    fontFamily: FONT_BOLD,
    fontSize: 13,
  },
  itemCopy: {
    flex: 1,
    minWidth: 0,
  },
  itemText: {
    fontFamily: FONT,
    fontSize: 14,
    lineHeight: 20,
  },
  itemInputInline: {
    flex: 1,
    minWidth: 0,
    width: '100%',
    fontFamily: FONT,
    fontSize: 14,
    lineHeight: 20,
    paddingVertical: 4,
    paddingHorizontal: 0,
  },
  itemDone: {
    textDecorationLine: 'line-through',
    opacity: 0.5,
  },
  itemDeleteBtn: {
    padding: 2,
  },
  addItemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginTop: 12,
  },
  addItemPrefixBox: {
    width: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 10,
  },
  addItemInput: {
    flex: 1,
    fontFamily: FONT,
    fontSize: 13,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 2,
  },
  blankInputBox: {
    minHeight: PARAGRAPH_MIN_HEIGHT,
    textAlignVertical: 'top',
  },
  addItemBtn: {
    backgroundColor: '#000000',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#000000',
  },
  addItemBtnText: {
    fontFamily: FONT_BOLD,
    color: '#FFFFFF',
    fontSize: 13,
  },
  deleteListRowBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 14,
    paddingTop: 8,
  },
  deleteListText: {
    fontFamily: FONT_BOLD,
    color: '#EF4444',
    fontSize: 12,
  },
  fabContainer: {
    position: 'absolute',
    bottom: 28,
    alignSelf: 'center',
    width: 60,
    height: 60,
  },
  fabShadowBackdrop: {
    position: 'absolute',
    top: 4,
    left: 4,
    width: 56,
    height: 56,
    backgroundColor: '#000000',
    borderRadius: 28,
  },
  fabBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#000000',
    borderWidth: 2.5,
    borderColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyboardAvoidingView: {
    flex: 1,
  },
  modalShade: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'flex-end',
  },
  modalCardWrapper: {
    position: 'relative',
    marginHorizontal: 12,
    marginBottom: 20,
  },
  modalShadowBackdrop: {
    position: 'absolute',
    top: 6,
    left: 6,
    right: -6,
    bottom: -6,
    backgroundColor: '#000000',
    borderRadius: 20,
  },
  modalCardBody: {
    borderRadius: 20,
    borderWidth: 3,
    borderColor: '#000000',
    padding: 20,
    maxHeight: 520,
  },
  modalTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  modalTitle: {
    fontFamily: FONT_BOLD,
    fontSize: 20,
  },
  modalError: {
    fontFamily: FONT_BOLD,
    color: '#EF4444',
    fontSize: 12,
    marginBottom: 8,
  },
  inputLabel: {
    fontFamily: FONT_BOLD,
    fontSize: 11,
    letterSpacing: 0.5,
    marginBottom: 6,
    marginTop: 8,
  },
  modalTextInput: {
    fontFamily: FONT_MED,
    fontSize: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 2,
    marginBottom: 8,
  },
  typeOptionsStack: {
    gap: 8,
    marginBottom: 16,
  },
  typeOptionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 12,
    borderWidth: 2.5,
  },
  typeOptionLeft: {
    flex: 1,
  },
  typeOptionTitle: {
    fontFamily: FONT_BOLD,
    fontSize: 14,
  },
  typeOptionSub: {
    fontFamily: FONT,
    fontSize: 11,
  },
  radioCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#000000',
  },
  createListBtn: {
    backgroundColor: '#000000',
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 2.5,
    borderColor: '#000000',
    alignItems: 'center',
  },
  createListBtnText: {
    fontFamily: FONT_BOLD,
    color: '#FFFFFF',
    fontSize: 15,
  },
  alertShade: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  alertCardWrapper: {
    position: 'relative',
    width: '100%',
  },
  alertShadowBackdrop: {
    position: 'absolute',
    top: 6,
    left: 6,
    right: -6,
    bottom: -6,
    backgroundColor: '#000000',
    borderRadius: 18,
  },
  alertCardBody: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 3,
    borderColor: '#000000',
    padding: 20,
  },
  alertHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  alertIconBadge: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#FDE047',
    borderWidth: 2,
    borderColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  alertTitle: {
    fontFamily: FONT_BOLD,
    fontSize: 18,
    color: '#000000',
  },
  alertMessage: {
    fontFamily: FONT_MED,
    fontSize: 13,
    color: '#3F3F46',
    lineHeight: 18,
    marginBottom: 18,
  },
  alertActionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  alertCancelBtn: {
    flex: 1,
    backgroundColor: '#F4F4F5',
    borderWidth: 2,
    borderColor: '#000000',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  alertCancelText: {
    fontFamily: FONT_BOLD,
    color: '#000000',
    fontSize: 13,
  },
  alertDeleteBtn: {
    flex: 1,
    backgroundColor: '#EF4444',
    borderWidth: 2,
    borderColor: '#000000',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  alertDeleteText: {
    fontFamily: FONT_BOLD,
    color: '#FFFFFF',
    fontSize: 13,
  },
});
