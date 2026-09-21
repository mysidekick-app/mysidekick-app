import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Check,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ListChecks,
  MoreVertical,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react-native';
import { router } from 'expo-router';

import { useApp } from '@/components/AppProvider';
import { supabase } from '@/lib/supabase';

type ListType =
  | 'blank'
  | 'checklist'
  | 'bullet'
  | 'numbered';

type ListItem = {
  id: string;
  title: string;
  completed: boolean;
};

type ListCard = {
  id: string;
  title: string;
  icon: string;
  list_type: ListType;
  items: ListItem[];
};

const FONT = 'Poppins-Regular';
const FONT_MED = 'Poppins-Medium';
const FONT_SEMI = 'Poppins-SemiBold';
const FONT_BOLD = 'Poppins-Bold';

const LIST_TYPES: {
  value: ListType;
  label: string;
  description: string;
}[] = [
  {
    value: 'blank',
    label: 'Blank list',
    description: 'Simple text items',
  },
  {
    value: 'checklist',
    label: 'Checklist',
    description: 'Items you can check off',
  },
  {
    value: 'bullet',
    label: 'Bullet list',
    description: 'Items with bullet points',
  },
  {
    value: 'numbered',
    label: 'Numbered list',
    description: 'Items with numbers',
  },
];

const getListTypeLabel = (type: ListType) =>
  LIST_TYPES.find(
    (item) => item.value === type,
  )?.label ?? 'Checklist';

export default function ListsScreen() {
  const {
    accentForeground,
    accentWash,
    isDark,
    onAccent,
  } = useApp();

  const [lists, setLists] = useState<ListCard[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(
    new Set(),
  );

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [newListOpen, setNewListOpen] = useState(false);
  const [newListTitle, setNewListTitle] = useState('');
  const [newListType, setNewListType] =
    useState<ListType>('checklist');
  const [savingList, setSavingList] = useState(false);

  const [menuOpen, setMenuOpen] = useState(false);

  /*
   * Search lists by title or item text.
   */
  const [searchQuery, setSearchQuery] = useState('');

  /*
   * Text currently being entered for each list.
   */
  const [newItemText, setNewItemText] = useState<
    Record<string, string>
  >({});

  /*
   * Dynamic height for Blank-list input boxes.
   */
  const [inputHeights, setInputHeights] = useState<
    Record<string, number>
  >({});

  const C = isDark
    ? {
        bg: '#090909',
        card: '#151515',
        border: '#2A2A2A',
        text: '#F4F2EE',
        muted: '#AAA59D',
        input: '#1E1E1E',
        inputBorder: '#363636',
      }
    : {
        bg: '#FBFAF8',
        card: '#FFFFFF',
        border: '#ECE9E4',
        text: '#27241F',
        muted: '#8F8A82',
        input: '#FCFBF9',
        inputBorder: '#E0DDD7',
      };

  /* =========================================================
     LOAD LISTS
  ========================================================= */

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const [
      { data: listRows, error: listErr },
      { data: itemRows, error: itemErr },
    ] = await Promise.all([
      supabase
        .from('lists')
        .select(
          'id, title, icon, list_type',
        )
        .order('created_at', {
          ascending: true,
        }),

      supabase
        .from('list_items')
        .select(
          'id, list_id, title, completed, position',
        )
        .order('position', {
          ascending: true,
        }),
    ]);

    if (listErr || itemErr) {
      console.log(
        'LIST LOAD ERROR:',
        listErr ?? itemErr,
      );

      setError(
        'Your lists could not be loaded.',
      );
      setLoading(false);
      return;
    }

    const items = (
      itemRows ?? []
    ) as {
      id: string;
      list_id: string;
      title: string;
      completed: boolean;
      position: number;
    }[];

    const cards: ListCard[] = (
      (listRows ?? []) as {
        id: string;
        title: string;
        icon: string;
        list_type: ListType | null;
      }[]
    ).map((list) => ({
      id: list.id,
      title: list.title,
      icon: list.icon ?? '',

      /*
       * Existing lists without list_type
       * remain checklists.
       */
      list_type:
        list.list_type ?? 'checklist',

      items: items
        .filter(
          (item) =>
            item.list_id === list.id,
        )
        .map((item) => ({
          id: item.id,
          title: item.title,
          completed: item.completed,
        })),
    }));

    setLists(cards);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  /* =========================================================
     SEARCH
  ========================================================= */

  const filteredLists = useMemo(() => {
    const query =
      searchQuery.trim().toLowerCase();

    if (!query) {
      return lists;
    }

    return lists.filter((list) => {
      const titleMatch =
        list.title
          .toLowerCase()
          .includes(query);

      const typeMatch =
        getListTypeLabel(
          list.list_type,
        )
          .toLowerCase()
          .includes(query);

      const itemMatch =
        list.items.some((item) =>
          item.title
            .toLowerCase()
            .includes(query),
        );

      return (
        titleMatch ||
        typeMatch ||
        itemMatch
      );
    });
  }, [lists, searchQuery]);

  /* =========================================================
     EXPAND / COLLAPSE
  ========================================================= */

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);

      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }

      return next;
    });
  };

  /* =========================================================
     NEW LIST
  ========================================================= */

  const openNewList = () => {
    setNewListTitle('');
    setNewListType('checklist');
    setError(null);
    setNewListOpen(true);
  };

  const saveList = async () => {
    if (!newListTitle.trim()) {
      setError(
        'Give your list a name.',
      );
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
        setError(
          'You must be logged in to create a list.',
        );
        setSavingList(false);
        return;
      }

      const {
        data,
        error: saveErr,
      } = await supabase
        .from('lists')
        .insert({
          user_id: user.id,
          title: newListTitle.trim(),
          list_type: newListType,
        })
        .select(
          'id, title, icon, list_type',
        )
        .maybeSingle();

      if (saveErr || !data) {
        console.log(
          'LIST SAVE ERROR:',
          saveErr,
        );

        setError(
          'The list could not be saved.',
        );
        setSavingList(false);
        return;
      }

      const created = data as {
        id: string;
        title: string;
        icon: string;
        list_type: ListType;
      };

      setLists((current) => [
        ...current,
        {
          id: created.id,
          title: created.title,
          icon: created.icon ?? '',
          list_type:
            created.list_type ??
            newListType,
          items: [],
        },
      ]);

      setExpanded((prev) => {
        const next = new Set(prev);
        next.add(created.id);
        return next;
      });

      setNewListOpen(false);
      setNewListTitle('');
      setNewListType('checklist');
    } catch (err) {
      console.log(
        'LIST SAVE EXCEPTION:',
        err,
      );

      setError(
        'Something went wrong while creating the list.',
      );
    } finally {
      setSavingList(false);
    }
  };

  /* =========================================================
     DELETE LIST
  ========================================================= */

  const deleteList = async (id: string) => {
    const previous = lists;

    setLists((current) =>
      current.filter(
        (list) => list.id !== id,
      ),
    );

    setExpanded((current) => {
      const next = new Set(current);
      next.delete(id);
      return next;
    });

    const { error: deleteError } =
      await supabase
        .from('lists')
        .delete()
        .eq('id', id);

    if (deleteError) {
      console.log(
        'LIST DELETE ERROR:',
        deleteError,
      );

      setError(
        'Could not delete the list.',
      );

      setLists(previous);
    }
  };

  /* =========================================================
     ADD ITEM
  ========================================================= */

  const addItem = async (listId: string) => {
    const rawText =
      newItemText[listId] ?? '';

    const text = rawText.trim();

    if (!text) {
      return;
    }

    const list = lists.find(
      (item) => item.id === listId,
    );

    if (!list) {
      return;
    }

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      setError(
        'You must be logged in to add an item.',
      );
      return;
    }

    const tempId = `temp-${Date.now()}`;

    const newItem: ListItem = {
      id: tempId,
      title: text,
      completed: false,
    };

    setLists((current) =>
      current.map((item) =>
        item.id === listId
          ? {
              ...item,
              items: [
                ...item.items,
                newItem,
              ],
            }
          : item,
      ),
    );

    setNewItemText((previous) => ({
      ...previous,
      [listId]: '',
    }));

    setInputHeights((previous) => ({
      ...previous,
      [listId]: 56,
    }));

    const nextPosition =
      list.items.length;

    const {
      data,
      error: insertError,
    } = await supabase
      .from('list_items')
      .insert({
        user_id: user.id,
        list_id: listId,
        title: text,
        completed: false,
        position: nextPosition,
      })
      .select(
        'id, title, completed',
      )
      .maybeSingle();

    if (insertError || !data) {
      console.log(
        'LIST ITEM INSERT ERROR:',
        insertError,
      );

      setError(
        'Could not add the item.',
      );

      setLists((current) =>
        current.map((item) =>
          item.id === listId
            ? {
                ...item,
                items:
                  item.items.filter(
                    (entry) =>
                      entry.id !==
                      tempId,
                  ),
              }
            : item,
        ),
      );

      return;
    }

    const saved = data as {
      id: string;
      title: string;
      completed: boolean;
    };

    setLists((current) =>
      current.map((item) =>
        item.id === listId
          ? {
              ...item,
              items:
                item.items.map(
                  (entry) =>
                    entry.id ===
                    tempId
                      ? {
                          id: saved.id,
                          title:
                            saved.title,
                          completed:
                            saved.completed,
                        }
                      : entry,
                ),
            }
          : item,
      ),
    );
  };

  /* =========================================================
     UPDATE INPUT HEIGHT
  ========================================================= */

  const updateInputHeight = (
    listId: string,
    height: number,
  ) => {
    const minimumHeight = 56;

    const nextHeight = Math.max(
      minimumHeight,
      Math.ceil(height),
    );

    setInputHeights((previous) => ({
      ...previous,
      [listId]: nextHeight,
    }));
  };

  /* =========================================================
     TOGGLE CHECKLIST ITEM
  ========================================================= */

  const toggleItem = async (
    listId: string,
    itemId: string,
  ) => {
    const list = lists.find(
      (item) => item.id === listId,
    );

    if (!list) return;

    if (
      list.list_type !==
      'checklist'
    ) {
      return;
    }

    const item = list.items.find(
      (entry) =>
        entry.id === itemId,
    );

    if (!item) return;

    const next = !item.completed;

    setLists((current) =>
      current.map((itemList) =>
        itemList.id === listId
          ? {
              ...itemList,
              items:
                itemList.items.map(
                  (entry) =>
                    entry.id ===
                    itemId
                      ? {
                          ...entry,
                          completed:
                            next,
                        }
                      : entry,
                ),
            }
          : itemList,
      ),
    );

    const {
      error: updateError,
    } = await supabase
      .from('list_items')
      .update({
        completed: next,
      })
      .eq('id', itemId);

    if (updateError) {
      console.log(
        'LIST ITEM UPDATE ERROR:',
        updateError,
      );

      setError(
        'Could not update the item.',
      );

      setLists((current) =>
        current.map((itemList) =>
          itemList.id === listId
            ? {
                ...itemList,
                items:
                  itemList.items.map(
                    (entry) =>
                      entry.id ===
                      itemId
                        ? {
                            ...entry,
                            completed:
                              !next,
                          }
                        : entry,
                  ),
              }
            : itemList,
        ),
      );
    }
  };

  /* =========================================================
     DELETE ITEM
  ========================================================= */

  const deleteItem = async (
    listId: string,
    itemId: string,
  ) => {
    const previous = lists;

    setLists((current) =>
      current.map((list) =>
        list.id === listId
          ? {
              ...list,
              items:
                list.items.filter(
                  (item) =>
                    item.id !==
                    itemId,
                ),
            }
          : list,
      ),
    );

    const {
      error: deleteError,
    } = await supabase
      .from('list_items')
      .delete()
      .eq('id', itemId);

    if (deleteError) {
      console.log(
        'LIST ITEM DELETE ERROR:',
        deleteError,
      );

      setError(
        'Could not delete the item.',
      );

      setLists(previous);
    }
  };

  /* =========================================================
     ITEM PREFIX
  ========================================================= */

  const renderItemPrefix = (
    list: ListCard,
    item: ListItem,
    index: number,
  ) => {
    if (
      list.list_type ===
      'checklist'
    ) {
      return (
        <Pressable
          onPress={() =>
            toggleItem(
              list.id,
              item.id,
            )
          }
          style={[
            styles.itemCheck,
            item.completed && {
              backgroundColor:
                accentForeground,
              borderColor:
                accentForeground,
            },
          ]}
          hitSlop={8}
        >
          {item.completed && (
            <Check
              color={onAccent}
              size={13}
            />
          )}
        </Pressable>
      );
    }

    if (
      list.list_type ===
      'bullet'
    ) {
      return (
        <View
          style={
            styles.bulletPrefix
          }
        >
          <Text
            style={[
              styles.bulletText,
              {
                color:
                  accentForeground,
              },
            ]}
          >
            •
          </Text>
        </View>
      );
    }

    if (
      list.list_type ===
      'numbered'
    ) {
      return (
        <View
          style={
            styles.numberPrefix
          }
        >
          <Text
            style={[
              styles.numberText,
              {
                color:
                  accentForeground,
              },
            ]}
          >
            {index + 1}.
          </Text>
        </View>
      );
    }

    return null;
  };

  /* =========================================================
     RENDER
  ========================================================= */

  return (
    <SafeAreaView
      style={[
        styles.safe,
        {
          backgroundColor:
            C.bg,
        },
      ]}
    >
      {/* =====================================================
          HEADER
      ===================================================== */}

      <View
        style={[
          styles.header,
          {
            borderBottomColor:
              C.border,
          },
        ]}
      >
        <Pressable
          onPress={() =>
            router.push('/modules')
          }
          style={[
            styles.headerBack,
            {
              backgroundColor:
                accentForeground,
            },
          ]}
          hitSlop={12}
        >
          <ChevronLeft
            color="#FFFFFF"
            size={22}
            strokeWidth={2.4}
          />
        </Pressable>

        <Text
          style={[
            styles.headerTitle,
            {
              color: isDark
                ? '#FFFFFF'
                : accentForeground,
            },
          ]}
        >
          LISTS
        </Text>

        <Pressable
          onPress={() =>
            setMenuOpen(true)
          }
          style={styles.headerBtn}
          hitSlop={12}
        >
          <MoreVertical
            color={C.text}
            size={22}
          />
        </Pressable>
      </View>

      {/* =====================================================
          SEARCH BAR
      ===================================================== */}

      <View
        style={[
          styles.searchWrap,
          {
            backgroundColor:
              C.input,
            borderColor:
              C.inputBorder,
          },
        ]}
      >
        <Search
          color={C.muted}
          size={18}
          strokeWidth={2}
        />

        <TextInput
          value={searchQuery}
          onChangeText={
            setSearchQuery
          }
          placeholder="Search lists"
          placeholderTextColor={
            C.muted
          }
          style={[
            styles.searchInput,
            {
              color: C.text,
            },
          ]}
          returnKeyType="search"
          clearButtonMode="never"
        />

        {searchQuery.length > 0 && (
          <Pressable
            onPress={() =>
              setSearchQuery('')
            }
            hitSlop={10}
            style={
              styles.searchClear
            }
          >
            <X
              color={C.muted}
              size={17}
            />
          </Pressable>
        )}
      </View>

      {/* =====================================================
          MENU
      ===================================================== */}

      <Modal
        visible={menuOpen}
        transparent
        animationType="fade"
        onRequestClose={() =>
          setMenuOpen(false)
        }
      >
        <Pressable
          style={styles.menuShade}
          onPress={() =>
            setMenuOpen(false)
          }
        >
          <Pressable
            style={[
              styles.menuCard,
              {
                backgroundColor:
                  C.card,
                borderColor:
                  C.border,
              },
            ]}
            onPress={(event) =>
              event.stopPropagation()
            }
          >
            <Pressable
              onPress={() => {
                setMenuOpen(false);
                router.push(
                  '/(tabs)/profile',
                );
              }}
              style={styles.menuItem}
            >
              <Text
                style={[
                  styles.menuItemText,
                  {
                    color: C.text,
                  },
                ]}
              >
                Settings
              </Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* =====================================================
          MAIN CONTENT
      ===================================================== */}

      <ScrollView
        contentContainerStyle={
          styles.content
        }
        showsVerticalScrollIndicator={
          false
        }
        keyboardShouldPersistTaps="handled"
      >
        {error && (
          <Text
            style={[
              styles.error,
              {
                color: '#C53A2F',
              },
            ]}
          >
            {error}
          </Text>
        )}

        {loading ? (
          <Text
            style={[
              styles.emptyText,
              {
                color: C.muted,
              },
            ]}
          >
            Loading your lists...
          </Text>
        ) : lists.length === 0 ? (
          <View style={styles.empty}>
            <Text
              style={[
                styles.emptyText,
                {
                  color: C.muted,
                },
              ]}
            >
              No lists yet. Tap the +
              button to create your
              first one.
            </Text>
          </View>
        ) : filteredLists.length ===
          0 ? (
          <View style={styles.empty}>
            <Text
              style={[
                styles.emptyText,
                {
                  color: C.muted,
                },
              ]}
            >
              No lists found for "
              {searchQuery}"
            </Text>
          </View>
        ) : (
          <View
            style={styles.listStack}
          >
            {filteredLists.map(
              (list) => {
                const isChecklist =
                  list.list_type ===
                  'checklist';

                const isBlank =
                  list.list_type ===
                  'blank';

                const done =
                  isChecklist
                    ? list.items.filter(
                        (item) =>
                          item.completed,
                      ).length
                    : 0;

                const total =
                  list.items.length;

                const pct =
                  isChecklist &&
                  total > 0
                    ? (done / total) *
                      100
                    : 0;

                const isOpen =
                  expanded.has(
                    list.id,
                  );

                const currentInput =
                  newItemText[
                    list.id
                  ] ?? '';

                const currentInputHeight =
                  inputHeights[
                    list.id
                  ] ?? 56;

                return (
                  <View
                    key={list.id}
                    style={[
                      styles.card,
                      {
                        backgroundColor:
                          C.card,
                        borderColor:
                          C.border,
                      },
                    ]}
                  >
                    {/* =================================================
                        CARD HEADER
                    ================================================= */}

                    <Pressable
                      onPress={() =>
                        toggleExpand(
                          list.id,
                        )
                      }
                      style={
                        styles.cardHeader
                      }
                    >
                      <View
                        style={
                          styles.cardHeaderLeft
                        }
                      >
                        <View
                          style={[
                            styles.cardIcon,
                            {
                              backgroundColor:
                                accentWash,
                            },
                          ]}
                        >
                          <ListChecks
                            color={
                              accentForeground
                            }
                            size={16}
                            strokeWidth={
                              2.2
                            }
                          />
                        </View>

                        <View
                          style={
                            styles.cardHeaderCopy
                          }
                        >
                          <Text
                            style={[
                              styles.cardTitle,
                              {
                                color:
                                  C.text,
                              },
                            ]}
                            numberOfLines={1}
                          >
                            {list.title}
                          </Text>

                          <Text
                            style={[
                              styles.cardMeta,
                              {
                                color:
                                  C.muted,
                              },
                            ]}
                          >
                            {getListTypeLabel(
                              list.list_type,
                            )}

                            {isChecklist
                              ? ` • ${done} of ${total} done`
                              : total > 0
                                ? ` • ${total} item${
                                    total ===
                                    1
                                      ? ''
                                      : 's'
                                  }`
                                : ''}
                          </Text>
                        </View>
                      </View>

                      <View
                        style={
                          styles.cardHeaderRight
                        }
                      >
                        {isChecklist && (
                          <View
                            style={[
                              styles.miniProgress,
                              {
                                backgroundColor:
                                  isDark
                                    ? '#292929'
                                    : '#F0EEEA',
                              },
                            ]}
                          >
                            <View
                              style={[
                                styles.miniProgressFill,
                                {
                                  width: `${pct}%`,
                                  backgroundColor:
                                    accentForeground,
                                },
                              ]}
                            />
                          </View>
                        )}

                        {isOpen ? (
                          <ChevronUp
                            color={
                              C.muted
                            }
                            size={18}
                          />
                        ) : (
                          <ChevronDown
                            color={
                              C.muted
                            }
                            size={18}
                          />
                        )}
                      </View>
                    </Pressable>

                    {/* =================================================
                        EXPANDED BODY
                    ================================================= */}

                    {isOpen && (
                      <View
                        style={[
                          styles.cardBody,
                          isBlank &&
                            styles.blankCardBody,
                        ]}
                      >
                        {list.items.length > 0 && (
                          list.items.map(
                            (
                              item,
                              index,
                            ) => (
                              <View
                                key={
                                  item.id
                                }
                                style={[
                                  styles.itemRow,
                                  isBlank &&
                                    styles.blankItemRow,
                                  {
                                    borderBottomColor:
                                      isDark
                                        ? '#1F1F1F'
                                        : '#F5F3EF',
                                  },
                                ]}
                              >
                                {renderItemPrefix(
                                  list,
                                  item,
                                  index,
                                )}

                                <View
                                  style={
                                    styles.itemCopy
                                  }
                                >
                                  <Text
                                    style={[
                                      styles.itemText,
                                      isBlank &&
                                        styles.blankItemText,
                                      {
                                        color:
                                          C.text,
                                      },
                                      isChecklist &&
                                        item.completed &&
                                        styles.itemDone,
                                    ]}
                                  >
                                    {
                                      item.title
                                    }
                                  </Text>
                                </View>

                                <Pressable
                                  onPress={() =>
                                    deleteItem(
                                      list.id,
                                      item.id,
                                    )
                                  }
                                  style={
                                    styles.itemDelete
                                  }
                                  hitSlop={
                                    8
                                  }
                                >
                                  <Trash2
                                    color={
                                      isDark
                                        ? '#555'
                                        : '#D8D5CE'
                                    }
                                    size={
                                      15
                                    }
                                  />
                                </Pressable>
                              </View>
                            ),
                          )
                        )}

                        {/* =================================================
                            DYNAMIC ADD ITEM AREA
                        ================================================= */}

                        {(!isBlank || list.items.length === 0) && (
                          <View
                            style={[
                              styles.addItemRow,
                              isBlank &&
                                styles.blankAddItemRow,
                              {
                                borderTopColor:
                                  isDark
                                    ? '#1F1F1F'
                                    : '#F5F3EF',
                              },
                            ]}
                          >
                            {!isBlank &&
                              list.list_type ===
                                'checklist' && (
                              <Plus
                                color={C.muted}
                                size={16}
                              />
                            )}

                            <TextInput
                              value={currentInput}
                              onChangeText={(text) => {
                                setNewItemText((previous) => ({
                                  ...previous,
                                  [list.id]: text,
                                }));
                              }}
                              onContentSizeChange={(event) => {
                                if (isBlank) {
                                  updateInputHeight(
                                    list.id,
                                    event.nativeEvent.contentSize.height,
                                  );
                                }
                              }}
                              placeholder="Add an item"
                              placeholderTextColor={C.muted}
                              multiline={isBlank}
                              scrollEnabled={false}
                              textAlignVertical={isBlank ? 'top' : 'center'}
                              style={[
                                styles.addItemInput,
                                isBlank && styles.blankAddItemInput,
                                { color: C.text },
                                isBlank && {
                                  minHeight: currentInputHeight,
                                },
                              ]}
                            />

                            <Pressable
                              onPress={() => addItem(list.id)}
                              style={[
                                styles.addItemBtn,
                                { backgroundColor: accentForeground },
                              ]}
                              hitSlop={6}
                            >
                              <Text
                                style={[
                                  styles.addItemBtnText,
                                  { color: onAccent },
                                ]}
                              >
                                Add
                              </Text>
                            </Pressable>
                          </View>
                        )}

                        {/* =================================================
                            DELETE LIST
                        ================================================= */}

                        <Pressable
                          onPress={() =>
                            deleteList(
                              list.id,
                            )
                          }
                          style={[
                            styles.deleteListBtn,
                            {
                              borderTopColor:
                                isDark
                                  ? '#1F1F1F'
                                  : '#F5F3EF',
                            },
                          ]}
                          hitSlop={8}
                        >
                          <Trash2
                            color={
                              C.muted
                            }
                            size={14}
                          />

                          <Text
                            style={[
                              styles.deleteListText,
                              {
                                color:
                                  C.muted,
                              },
                            ]}
                          >
                            Delete list
                          </Text>
                        </Pressable>
                      </View>
                    )}
                  </View>
                );
              },
            )}
          </View>
        )}
      </ScrollView>

      {/* =====================================================
          FLOATING ADD BUTTON
      ===================================================== */}

      <Pressable
        onPress={openNewList}
        style={({ pressed }) => [
          styles.fab,
          {
            backgroundColor:
              accentForeground,
          },
          pressed && {
            opacity: 0.85,
          },
        ]}
      >
        <Plus
          color="#FFFFFF"
          size={28}
          strokeWidth={2.6}
        />
      </Pressable>

      {/* =====================================================
          NEW LIST MODAL
      ===================================================== */}

      <Modal
        visible={newListOpen}
        transparent
        animationType="slide"
        onRequestClose={() =>
          setNewListOpen(false)
        }
      >
        <View
          style={styles.modalShade}
        >
          <View
            style={[
              styles.modalCard,
              {
                backgroundColor:
                  C.card,
              },
            ]}
          >
            <View
              style={
                styles.modalTitleRow
              }
            >
              <Text
                style={[
                  styles.modalTitle,
                  {
                    color: C.text,
                  },
                ]}
              >
                New list
              </Text>

              <Pressable
                onPress={() =>
                  setNewListOpen(false)
                }
                hitSlop={12}
              >
                <X
                  color={C.muted}
                  size={21}
                />
              </Pressable>
            </View>

            {error && (
              <Text
                style={[
                  styles.error,
                  {
                    color: '#C53A2F',
                    marginTop: 4,
                  },
                ]}
              >
                {error}
              </Text>
            )}

            <Text
              style={[
                styles.label,
                {
                  color: C.muted,
                },
              ]}
            >
              List title
            </Text>

            <TextInput
              value={newListTitle}
              onChangeText={
                setNewListTitle
              }
              placeholder="e.g. Groceries, Packing list"
              placeholderTextColor={
                C.muted
              }
              style={[
                styles.input,
                {
                  backgroundColor:
                    C.input,
                  borderColor:
                    C.inputBorder,
                  color: C.text,
                },
              ]}
              autoFocus
            />

            <Text
              style={[
                styles.label,
                {
                  color: C.muted,
                },
              ]}
            >
              List type
            </Text>

            <View
              style={
                styles.typeOptions
              }
            >
              {LIST_TYPES.map(
                (type) => {
                  const selected =
                    newListType ===
                    type.value;

                  /*
                   * Light mode:
                   * selected = global accent
                   *
                   * Dark mode:
                   * selected = white
                   * text = black
                   */
                  const selectedBackground =
                    isDark
                      ? '#FFFFFF'
                      : accentForeground;

                  const selectedText =
                    isDark
                      ? '#000000'
                      : onAccent;

                  return (
                    <Pressable
                      key={
                        type.value
                      }
                      onPress={() =>
                        setNewListType(
                          type.value,
                        )
                      }
                      style={[
                        styles.typeOption,
                        {
                          backgroundColor:
                            selected
                              ? selectedBackground
                              : C.input,
                          borderColor:
                            selected
                              ? selectedBackground
                              : C.inputBorder,
                        },
                      ]}
                    >
                      <View
                        style={
                          styles.typeOptionCopy
                        }
                      >
                        <Text
                          style={[
                            styles.typeOptionTitle,
                            {
                              color:
                                selected
                                  ? selectedText
                                  : C.text,
                            },
                          ]}
                        >
                          {
                            type.label
                          }
                        </Text>

                        <Text
                          style={[
                            styles.typeOptionDescription,
                            {
                              color:
                                selected
                                  ? isDark
                                    ? '#333333'
                                    : selectedText
                                  : C.muted,
                            },
                          ]}
                        >
                          {
                            type.description
                          }
                        </Text>
                      </View>

                      <View
                        style={[
                          styles.radio,
                          {
                            borderColor:
                              selected
                                ? selectedText
                                : C.inputBorder,
                          },
                        ]}
                      >
                        {selected && (
                          <View
                            style={[
                              styles.radioSelected,
                              {
                                backgroundColor:
                                  selectedText,
                              },
                            ]}
                          />
                        )}
                      </View>
                    </Pressable>
                  );
                },
              )}
            </View>

            <Pressable
              disabled={savingList}
              onPress={saveList}
              style={[
                styles.saveButton,
                {
                  backgroundColor:
                    accentForeground,
                },
                savingList && {
                  opacity: 0.6,
                },
              ]}
            >
              <Text
                style={[
                  styles.saveText,
                  {
                    color: onAccent,
                  },
                ]}
              >
                {savingList
                  ? 'Saving...'
                  : 'Create list'}
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

/* =========================================================
   STYLES
========================================================= */

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },

  /* =======================================================
     HEADER
  ======================================================= */

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent:
      'space-between',
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
    justifyContent:
      'center',
  },

  headerBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent:
      'center',
  },

  headerTitle: {
    fontFamily: FONT_BOLD,
    fontSize: 18,
    letterSpacing: 1.5,
  },

  /* =======================================================
     SEARCH
  ======================================================= */

  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 14,
    paddingHorizontal: 13,
    height: 46,
    borderRadius: 13,
    borderWidth: 1,
  },

  searchInput: {
    flex: 1,
    minWidth: 0,
    height: 44,
    marginLeft: 9,
    fontFamily: FONT,
    fontSize: 14,
    paddingVertical: 0,
  },

  searchClear: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent:
      'center',
  },

  /* =======================================================
     MENU
  ======================================================= */

  menuShade: {
    flex: 1,
    backgroundColor:
      'rgba(0,0,0,0.25)',
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
    shadowOffset: {
      width: 0,
      height: 4,
    },
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

  /* =======================================================
     CONTENT
  ======================================================= */

  content: {
    padding: 16,
    paddingBottom: 100,
  },

  error: {
    fontFamily: FONT_MED,
    fontSize: 13,
    marginBottom: 10,
  },

  empty: {
    paddingVertical: 40,
    alignItems: 'center',
  },

  emptyText: {
    fontFamily: FONT,
    fontSize: 14,
    textAlign: 'center',
  },

  listStack: {
    gap: 12,
  },

  /* =======================================================
     CARD
  ======================================================= */

  card: {
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
  },

  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent:
      'space-between',
    padding: 14,
  },

  cardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    minWidth: 0,
  },

  cardIcon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent:
      'center',
  },

  cardHeaderCopy: {
    flex: 1,
    gap: 3,
    minWidth: 0,
  },

  cardTitle: {
    fontFamily: FONT_MED,
    fontSize: 15,
  },

  cardMeta: {
    fontFamily: FONT,
    fontSize: 12,
  },

  cardHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginLeft: 8,
  },

  miniProgress: {
    width: 60,
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },

  miniProgressFill: {
    height: 6,
    borderRadius: 3,
  },

  /* =======================================================
     CARD BODY
  ======================================================= */

  cardBody: {
    paddingHorizontal: 14,
    paddingBottom: 14,
  },

  blankCardBody: {
    paddingTop: 2,
  },

  /* =======================================================
     ITEMS
  ======================================================= */

  itemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },

  blankItemRow: {
    alignItems: 'flex-start',
    paddingVertical: 12,
  },

  itemCheck: {
    width: 22,
    height: 22,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: '#D8D5CE',
    alignItems: 'center',
    justifyContent:
      'center',
    marginTop: 1,
  },

  bulletPrefix: {
    width: 22,
    alignItems: 'center',
    justifyContent:
      'center',
    paddingTop: 1,
  },

  bulletText: {
    fontFamily: FONT_BOLD,
    fontSize: 20,
    lineHeight: 20,
  },

  numberPrefix: {
    width: 26,
    alignItems: 'flex-end',
    justifyContent:
      'center',
    paddingTop: 2,
  },

  numberText: {
    fontFamily: FONT_MED,
    fontSize: 14,
  },

  itemCopy: {
    flex: 1,
    minWidth: 0,
  },

  itemText: {
    fontFamily: FONT_MED,
    fontSize: 14,
    lineHeight: 21,
    flexShrink: 1,
  },

  blankItemText: {
    fontFamily: FONT,
    fontSize: 14,
    lineHeight: 23,
    flexShrink: 1,
  },

  itemDone: {
    textDecorationLine:
      'line-through',
    opacity: 0.5,
  },

  itemDelete: {
    width: 24,
    minHeight: 22,
    alignItems: 'center',
    justifyContent:
      'center',
    marginTop: 1,
  },

  noItemsText: {
    fontFamily: FONT,
    fontSize: 13,
    paddingVertical: 12,
  },

  /* =======================================================
     ADD ITEM
  ======================================================= */

  addItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
  },

  blankAddItemRow: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 10,
  },

  addItemInput: {
    flex: 1,
    minWidth: 0,
    fontFamily: FONT,
    fontSize: 14,
    paddingVertical: 4,
  },

  /*
   * Blank-list input:
   * - no internal scrolling
   * - overflow hidden
   * - grows dynamically
   */
  blankAddItemInput: {
    width: '100%',
    minHeight: 56,
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 12,
    borderWidth: 1,
    borderRadius: 12,
    borderColor: '#363636',
    lineHeight: 21,
    textAlignVertical: 'top',
  },

  addItemBtn: {
    alignSelf: 'flex-end',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 9,
    minHeight: 36,
    alignItems: 'center',
    justifyContent:
      'center',
  },

  addItemBtnText: {
    fontFamily: FONT_SEMI,
    fontSize: 13,
  },

  /* =======================================================
     DELETE LIST
  ======================================================= */

  deleteListBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent:
      'center',
    gap: 6,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
  },

  deleteListText: {
    fontFamily: FONT_MED,
    fontSize: 12,
  },

  /* =======================================================
     FAB
  ======================================================= */

  fab: {
    position: 'absolute',
    bottom: 30,
    alignSelf: 'center',
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent:
      'center',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: {
      width: 0,
      height: 4,
    },
    elevation: 6,
  },

  /* =======================================================
     NEW LIST MODAL
  ======================================================= */

  modalShade: {
    flex: 1,
    justifyContent:
      'flex-end',
    backgroundColor:
      'rgba(0,0,0,0.45)',
  },

  modalCard: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 22,
    paddingBottom: 34,
    maxHeight: '92%',
  },

  modalTitleRow: {
    flexDirection: 'row',
    justifyContent:
      'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },

  modalTitle: {
    fontFamily: FONT_BOLD,
    fontSize: 18,
    flex: 1,
    marginRight: 12,
  },

  label: {
    fontFamily: FONT_MED,
    fontSize: 13,
    marginTop: 14,
    marginBottom: 6,
  },

  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontFamily: FONT,
    fontSize: 15,
  },

  typeOptions: {
    gap: 8,
  },

  typeOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent:
      'space-between',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },

  typeOptionCopy: {
    flex: 1,
    gap: 2,
  },

  typeOptionTitle: {
    fontFamily: FONT_MED,
    fontSize: 14,
  },

  typeOptionDescription: {
    fontFamily: FONT,
    fontSize: 11,
  },

  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent:
      'center',
    marginLeft: 12,
  },

  radioSelected: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },

  saveButton: {
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 22,
  },

  saveText: {
    fontFamily: FONT_SEMI,
    fontSize: 15,
  },
});