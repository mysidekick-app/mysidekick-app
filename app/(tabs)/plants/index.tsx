import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  KeyboardAvoidingView,
  Modal,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { SafeAreaView } from 'react-native-safe-area-context';
import { Platform } from 'react-native';

import {
  ChevronLeft,
  MoreVertical,
  Droplets,
  Pencil,
  Plus,
  Sprout,
  Sun,
  Trash2,
  X,
} from 'lucide-react-native';

import { router } from 'expo-router';

import { useApp } from '@/components/AppProvider';
import { supabase } from '@/lib/supabase';
import { DatePickerInput } from '@/components/DatePickerInput';

type Plant = {
  id: string;
  name: string;
  species: string | null;
  watering_interval_days: number;
  sunlight: string;
  last_watered_on: string | null;
  notes: string | null;
};

const SUNLIGHT_OPTIONS = [
  'Low',
  'Indirect',
  'Bright',
  'Direct',
];

const PLANT_FIELDS =
  'id, name, species, watering_interval_days, sunlight, last_watered_on, notes';

const todayStr = () => {
  const d = new Date();

  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');

  return `${y}-${m}-${day}`;
};

const formatDate = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');

  return `${y}-${m}-${d}`;
};

const displayDate = (dateStr: string) => {
  const date = new Date(`${dateStr}T12:00:00`);

  return date.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};

const addDays = (
  dateStr: string,
  days: number
): string => {
  const date = new Date(`${dateStr}T12:00:00`);

  date.setDate(date.getDate() + days);

  return formatDate(date);
};

const daysUntil = (dateStr: string): number => {
  const today = new Date();

  today.setHours(0, 0, 0, 0);

  const target = new Date(`${dateStr}T12:00:00`);

  target.setHours(0, 0, 0, 0);

  return Math.round(
    (target.getTime() - today.getTime()) / 86400000
  );
};

const getNextWateringDate = (plant: Plant) => {
  if (!plant.last_watered_on) {
    return null;
  }

  return addDays(
    plant.last_watered_on,
    plant.watering_interval_days
  );
};

const prettyDue = (
  plant: Plant
): {
  label: string;
  overdue: boolean;
  soon: boolean;
  nextDate: string | null;
} => {
  if (!plant.last_watered_on) {
    return {
      label: 'Not watered yet',
      overdue: false,
      soon: true,
      nextDate: null,
    };
  }

  const nextDate = getNextWateringDate(plant);

  if (!nextDate) {
    return {
      label: 'Not watered yet',
      overdue: false,
      soon: true,
      nextDate: null,
    };
  }

  const diff = daysUntil(nextDate);

  if (diff < 0) {
    const overdueDays = Math.abs(diff);

    return {
      label: `${overdueDays} day${
        overdueDays === 1 ? '' : 's'
      } overdue`,
      overdue: true,
      soon: false,
      nextDate,
    };
  }

  if (diff === 0) {
    return {
      label: 'Water today',
      overdue: false,
      soon: true,
      nextDate,
    };
  }

  if (diff === 1) {
    return {
      label: 'Water tomorrow',
      overdue: false,
      soon: true,
      nextDate,
    };
  }

  return {
    label: `Water in ${diff} days`,
    overdue: false,
    soon: false,
    nextDate,
  };
};

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

export default function PlantsScreen() {
  const {
    accentForeground,
    accentColor: rawAccent,
    isDark,
    onAccent,
  } = useApp() as any;

  const pageBg = rawAccent || accentForeground || '#FDE047';
  const isAccentPureBlack = isAccentBlack(pageBg);

  const [plants, setPlants] = useState<Plant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [detailOpen, setDetailOpen] =
    useState<Plant | null>(null);

  const [editingPlantId, setEditingPlantId] =
    useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] =
    useState<Plant | null>(null);

  const [name, setName] = useState('');
  const [species, setSpecies] = useState('');
  const [interval, setInterval] = useState('7');
  const [sunlight, setSunlight] = useState('Indirect');
  const [lastWatered, setLastWatered] = useState('');
  const [notes, setNotes] = useState('');

  const [saving, setSaving] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [wateringId, setWateringId] =
    useState<string | null>(null);
  const [deletingId, setDeletingId] =
    useState<string | null>(null);

  const resetForm = () => {
    setEditingPlantId(null);
    setName('');
    setSpecies('');
    setInterval('7');
    setSunlight('Indirect');
    setLastWatered(todayStr());
    setNotes('');
  };

  const closePlantModal = () => {
    if (saving) {
      return;
    }

    setModalOpen(false);
    setEditingPlantId(null);
    setError(null);
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data, error: loadErr } =
      await supabase
        .from('plants')
        .select(PLANT_FIELDS)
        .order('created_at', {
          ascending: true,
        });

    if (loadErr) {
      setError(
        'Your plants could not be loaded.'
      );
    } else {
      setPlants((data ?? []) as Plant[]);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openNew = () => {
    resetForm();
    setError(null);
    setModalOpen(true);
  };

  const openEdit = (plant: Plant) => {
    setEditingPlantId(plant.id);

    setName(plant.name);
    setSpecies(plant.species ?? '');

    setInterval(
      String(plant.watering_interval_days)
    );

    setSunlight(plant.sunlight);

    setLastWatered(
      plant.last_watered_on ?? ''
    );

    setNotes(plant.notes ?? '');

    setError(null);
    setDetailOpen(null);
    setModalOpen(true);
  };

  const savePlant = async () => {
    const trimmedName = name.trim();

    if (!trimmedName) {
      setError('Give your plant a name.');
      return;
    }

    const intervalNumber = Number(
      interval.trim()
    );

    if (
      !interval.trim() ||
      !Number.isFinite(intervalNumber) ||
      intervalNumber <= 0
    ) {
      setError(
        'Enter a watering frequency greater than 0 days.'
      );
      return;
    }

    setSaving(true);
    setError(null);

    const payload = {
      name: trimmedName,
      species: species.trim() || null,
      watering_interval_days:
        Math.round(intervalNumber),
      sunlight,
      last_watered_on:
        lastWatered.trim() || null,
      notes: notes.trim() || null,
    };

    /*
     * EDIT EXISTING PLANT
     */
    if (editingPlantId) {
      const plantId = editingPlantId;

      const { data, error: updateErr } =
        await supabase
          .from('plants')
          .update(payload)
          .eq('id', plantId)
          .select(PLANT_FIELDS)
          .maybeSingle();

      if (updateErr || !data) {
        setError(
          'The plant could not be updated.'
        );
      } else {
        const updatedPlant =
          data as Plant;

        setPlants((current) =>
          current.map((plant) =>
            plant.id === plantId
              ? updatedPlant
              : plant
          )
        );

        setDetailOpen(null);
        setModalOpen(false);
        setEditingPlantId(null);
      }

      setSaving(false);
      return;
    }

    /*
     * CREATE NEW PLANT
     */
    const { data, error: insertErr } =
      await supabase
        .from('plants')
        .insert(payload)
        .select(PLANT_FIELDS)
        .maybeSingle();

    if (insertErr || !data) {
      setError(
        'The plant could not be saved.'
      );
    } else {
      setPlants((current) => [
        ...current,
        data as Plant,
      ]);

      setModalOpen(false);
    }

    setSaving(false);
  };

  /*
   * WATER PLANT
   */
  const waterNow = async (plant: Plant) => {
    if (wateringId === plant.id) {
      return;
    }

    const today = todayStr();

    const previousPlant = plant;

    const updatedPlant: Plant = {
      ...plant,
      last_watered_on: today,
    };

    setError(null);
    setWateringId(plant.id);

    /*
     * Update UI immediately.
     */
    setPlants((current) =>
      current.map((item) =>
        item.id === plant.id
          ? updatedPlant
          : item
      )
    );

    if (detailOpen?.id === plant.id) {
      setDetailOpen(updatedPlant);
    }

    /*
     * Save to Supabase.
     */
    const { data, error: updateErr } =
      await supabase
        .from('plants')
        .update({
          last_watered_on: today,
        })
        .eq('id', plant.id)
        .select(PLANT_FIELDS)
        .maybeSingle();

    if (updateErr || !data) {
      /*
       * Restore previous state if saving failed.
       */
      setPlants((current) =>
        current.map((item) =>
          item.id === plant.id
            ? previousPlant
            : item
        )
      );

      if (detailOpen?.id === plant.id) {
        setDetailOpen(previousPlant);
      }

      setError(
        'Could not record watering.'
      );
    } else {
      const savedPlant = data as Plant;

      setPlants((current) =>
        current.map((item) =>
          item.id === plant.id
            ? savedPlant
            : item
        )
      );

      if (detailOpen?.id === plant.id) {
        setDetailOpen(savedPlant);
      }
    }

    setWateringId(null);
  };

  /*
   * DELETE PLANT
   */
  const deletePlant = async (plant: Plant) => {
    if (deletingId === plant.id) {
      return;
    }

    const previousPlants = [...plants];

    setError(null);
    setDeletingId(plant.id);

    /*
     * Remove immediately from UI.
     */
    setPlants((current) =>
      current.filter(
        (item) => item.id !== plant.id
      )
    );

    setDeleteTarget(null);
    setDetailOpen(null);

    /*
     * Delete from Supabase.
     */
    const { error: deleteErr } =
      await supabase
        .from('plants')
        .delete()
        .eq('id', plant.id);

    if (deleteErr) {
      /*
       * Restore if delete failed.
       */
      setPlants(previousPlants);

      setError(
        'Could not delete the plant.'
      );
    }

    setDeletingId(null);
  };

  const confirmDeletePlant = (plant: Plant) => {
    setDeleteTarget(plant);
  };

  const sorted = useMemo(() => {
    return [...plants].sort((a, b) => {
      const aNext =
        getNextWateringDate(a);

      const bNext =
        getNextWateringDate(b);

      const aDays = aNext
        ? daysUntil(aNext)
        : -9999;

      const bDays = bNext
        ? daysUntil(bNext)
        : -9999;

      return aDays - bDays;
    });
  }, [plants]);

  return (
    <SafeAreaView
      style={[
        styles.safe,
        {
          backgroundColor: pageBg,
        },
      ]}
    >
      <StatusBar
        barStyle={isAccentPureBlack ? 'light-content' : 'dark-content'}
        backgroundColor={pageBg}
      />

      {/* HEADER */}

      <View
        style={[
          styles.header,
        ]}
      >
        <Pressable
          onPress={() =>
            router.push('/modules')
          }
          style={({ pressed }) => [
            styles.headerBack,
            pressed && styles.pressedBtn,
          ]}
          hitSlop={12}
        >
          <ChevronLeft
            color="#FFFFFF"
            size={22}
            strokeWidth={2.8}
          />
        </Pressable>

        <Text
          style={[
            styles.headerTitle,
            {
              color: '#000000',
            },
          ]}
        >
          PLANTS
        </Text>

        <Pressable
          onPress={() => setMenuOpen(true)}
          style={({ pressed }) => [
            styles.headerBtn,
            pressed && styles.pressedBtn,
          ]}
          hitSlop={12}
        >
          <MoreVertical
            color="#000000"
            size={22}
            strokeWidth={2.5}
          />
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
              {
                backgroundColor: isDark ? '#121212' : '#FFFFFF',
                borderColor: '#000000',
              },
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
              <Text
                style={[
                  styles.menuItemText,
                  { color: isDark ? '#FFFFFF' : '#000000' },
                ]}
              >
                Settings
              </Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* PLANT LIST (2 PER ROW GRID) */}

      <ScrollView
        contentContainerStyle={
          styles.content
        }
        showsVerticalScrollIndicator={false}
      >
        {error && (
          <Text
            style={[
              styles.error,
              {
                color: '#EF4444',
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
                color: '#000000',
              },
            ]}
          >
            Loading your plants...
          </Text>
        ) : plants.length === 0 ? (
          <View style={styles.empty}>
            <View
              style={[
                styles.emptyIcon,
                {
                  backgroundColor: '#000000',
                  borderColor: '#FFFFFF',
                  borderWidth: 2,
                },
              ]}
            >
              <Sprout
                color={pageBg}
                size={24}
              />
            </View>

            <Text
              style={[
                styles.emptyTitle,
                {
                  color: '#000000',
                },
              ]}
            >
              No plants yet
            </Text>

            <Text
              style={[
                styles.emptyText,
                {
                  color: '#000000',
                },
              ]}
            >
              Tap the + button to start
              tracking your first plant.
            </Text>
          </View>
        ) : (
          <View style={styles.gridContainer}>
            {sorted.map((plant) => {
              const due =
                prettyDue(plant);

              return (
                <View
                  key={plant.id}
                  style={styles.cardContainer}
                >
                  <View style={styles.cardShadowBackdrop} />
                  <Pressable
                    onPress={() =>
                      setDetailOpen(plant)
                    }
                    style={({ pressed }) => [
                      styles.card,
                      {
                        backgroundColor: isDark ? '#121212' : '#FFFFFF',
                        borderColor: '#000000',
                      },
                      pressed && styles.pressedBtn,
                    ]}
                  >
                    {/* TOP ROW */}

                    <View
                      style={styles.cardTop}
                    >
                      <View
                        style={[
                          styles.cardIcon,
                          {
                            backgroundColor: pageBg,
                          },
                        ]}
                      >
                        <Sprout
                          color="#000000"
                          size={18}
                          strokeWidth={2.4}
                        />
                      </View>

                      {/* EDIT PEN */}

                      <Pressable
                        onPress={(event) => {
                          event.stopPropagation();
                          openEdit(plant);
                        }}
                        hitSlop={12}
                        style={({ pressed }) => [
                          styles.editPenButton,
                          pressed && {
                            opacity: 0.5,
                          },
                        ]}
                      >
                        <Pencil
                          color={isDark ? pageBg : '#000000'}
                          size={18}
                          strokeWidth={2.4}
                        />
                      </Pressable>
                    </View>

                    {/* PLANT NAME */}

                    <View style={styles.cardBodyPressable}>
                      <Text
                        style={[
                          styles.plantName,
                          {
                            color: isDark ? pageBg : '#000000',
                          },
                        ]}
                        numberOfLines={1}
                      >
                        {plant.name}
                      </Text>

                      {plant.species ? (
                        <Text
                          style={[
                            styles.plantSpecies,
                            {
                              color: isDark ? '#A1A1AA' : '#52525B',
                            },
                          ]}
                          numberOfLines={1}
                        >
                          {plant.species}
                        </Text>
                      ) : null}

                      {/* DUE TAG */}

                      <View
                        style={[
                          styles.duePill,
                          due.overdue &&
                            styles.duePillOverdue,
                          !due.overdue &&
                            due.soon && {
                              backgroundColor: pageBg,
                            },
                          !due.overdue &&
                            !due.soon && {
                              backgroundColor: isDark ? '#27272A' : '#F4F4F5',
                            },
                        ]}
                      >
                        <Text
                          style={[
                            styles.duePillText,
                            {
                              color:
                                due.overdue
                                  ? '#FFFFFF'
                                  : due.soon
                                    ? '#000000'
                                    : (isDark ? '#FFFFFF' : '#000000'),
                            },
                          ]}
                        >
                          {due.label}
                        </Text>
                      </View>

                      {/* META */}

                      <View
                        style={styles.cardMeta}
                      >
                        <View
                          style={
                            styles.metaItem
                          }
                        >
                          <Sun
                            color={isDark ? '#A1A1AA' : '#52525B'}
                            size={12}
                          />

                          <Text
                            style={[
                              styles.metaText,
                              {
                                color: isDark ? '#A1A1AA' : '#52525B',
                              },
                            ]}
                          >
                            {plant.sunlight}
                          </Text>
                        </View>

                        <Text
                          style={[
                            styles.metaText,
                            {
                              color: isDark ? '#A1A1AA' : '#52525B',
                            },
                          ]}
                        >
                          · {plant.watering_interval_days}d
                        </Text>
                      </View>
                    </View>
                  </Pressable>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* ADD BUTTON */}

      <Pressable
        onPress={openNew}
        style={({ pressed }) => [
          styles.fab,
          {
            backgroundColor: '#000000',
            borderWidth: 2,
            borderColor: pageBg,
          },
          pressed && styles.pressedBtn,
        ]}
      >
        <Plus
          color={pageBg}
          size={28}
          strokeWidth={2.8}
        />
      </Pressable>

      {/* ADD / EDIT MODAL */}

      <Modal
        visible={modalOpen}
        transparent
        animationType="fade"
        onRequestClose={
          closePlantModal
        }
      >
        <Pressable style={styles.centeredModalBackdrop} onPress={closePlantModal}>
          <Pressable
            style={[
              styles.centeredModalCard,
              {
                backgroundColor: isDark ? '#18181B' : '#FFFFFF',
              },
            ]}
            onPress={(e) => e.stopPropagation()}
          >
            <View
              style={styles.modalTitleRow}
            >
              <Text
                style={[
                  styles.modalTitle,
                  {
                    color: pageBg,
                  },
                ]}
              >
                {editingPlantId
                  ? 'Edit plant'
                  : 'New plant'}
              </Text>

              <Pressable
                onPress={
                  closePlantModal
                }
                hitSlop={12}
              >
                <X
                  color={isDark ? '#FFFFFF' : '#000000'}
                  size={21}
                  strokeWidth={2.5}
                />
              </Pressable>
            </View>

            <ScrollView
              style={styles.modalScroll}
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
                      color:
                        '#EF4444',
                      marginTop: 4,
                    },
                  ]}
                >
                  {error}
                </Text>
              )}

              {/* NAME */}

              <Text
                style={[
                  styles.label,
                  {
                    color: isDark ? '#A1A1AA' : '#52525B',
                  },
                ]}
              >
                Name
              </Text>

              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="e.g. Monstera"
                placeholderTextColor={
                  isDark ? '#71717A' : '#A1A1AA'
                }
                style={[
                  styles.input,
                  {
                    backgroundColor:
                      isDark ? '#27272A' : '#F4F4F5',
                    borderColor:
                      '#000000',
                    color: isDark ? '#FFFFFF' : '#000000',
                  },
                ]}
                autoFocus
              />

              {/* SPECIES */}

              <Text
                style={[
                  styles.label,
                  {
                    color: isDark ? '#A1A1AA' : '#52525B',
                  },
                ]}
              >
                Species (optional)
              </Text>

              <TextInput
                value={species}
                onChangeText={
                  setSpecies
                }
                placeholder="e.g. Monstera deliciosa"
                placeholderTextColor={
                  isDark ? '#71717A' : '#A1A1AA'
                }
                style={[
                  styles.input,
                  {
                    backgroundColor:
                      isDark ? '#27272A' : '#F4F4F5',
                    borderColor:
                      '#000000',
                    color: isDark ? '#FFFFFF' : '#000000',
                  },
                ]}
              />

              {/* WATERING FREQUENCY */}

              <Text
                style={[
                  styles.label,
                  {
                    color: isDark ? '#A1A1AA' : '#52525B',
                  },
                ]}
              >
                Watering frequency
              </Text>

              <View
                style={
                  styles.frequencyRow
                }
              >
                <Text
                  style={[
                    styles.frequencyText,
                    {
                      color: isDark ? '#FFFFFF' : '#000000',
                    },
                  ]}
                >
                  Every
                </Text>

                <TextInput
                  value={interval}
                  onChangeText={(value) =>
                    setInterval(
                      value.replace(
                        /[^0-9]/g,
                        ''
                      )
                    )
                  }
                  keyboardType="number-pad"
                  placeholder="7"
                  placeholderTextColor={
                    isDark ? '#71717A' : '#A1A1AA'
                  }
                  style={[
                    styles.intervalInput,
                    {
                      backgroundColor:
                        isDark ? '#27272A' : '#F4F4F5',
                      borderColor:
                        '#000000',
                      color: isDark ? '#FFFFFF' : '#000000',
                    },
                  ]}
                  selectTextOnFocus
                />

                <Text
                  style={[
                    styles.frequencyText,
                    {
                      color: isDark ? '#FFFFFF' : '#000000',
                    },
                  ]}
                >
                  days
                </Text>
              </View>

              {/* SUNLIGHT */}

              <Text
                style={[
                  styles.label,
                  {
                    color: isDark ? '#A1A1AA' : '#52525B',
                  },
                ]}
              >
                Sunlight
              </Text>

              <View
                style={styles.chipRow}
              >
                {SUNLIGHT_OPTIONS.map(
                  (option) => (
                    <Pressable
                      key={option}
                      onPress={() =>
                        setSunlight(
                          option
                        )
                      }
                      style={[
                        styles.chip,
                        {
                          borderColor:
                            '#000000',
                          backgroundColor:
                            sunlight === option
                              ? pageBg
                              : (isDark ? '#27272A' : '#F4F4F5'),
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          {
                            color:
                              sunlight === option
                                ? '#000000'
                                : (isDark ? '#FFFFFF' : '#000000'),
                          },
                        ]}
                      >
                        {option}
                      </Text>
                    </Pressable>
                  )
                )}
              </View>

              {/* LAST WATERED */}

              <DatePickerInput
                value={lastWatered}
                onChange={
                  setLastWatered
                }
                label="Last watered"
                accent={
                  pageBg
                }
                onAccent="#000000"
                isDark={isDark}
                placeholder="Select date"
              />

              {/* NOTES */}

              <Text
                style={[
                  styles.label,
                  {
                    color: isDark ? '#A1A1AA' : '#52525B',
                  },
                ]}
              >
                Notes (optional)
              </Text>

              <TextInput
                value={notes}
                onChangeText={setNotes}
                placeholder="Care tips"
                placeholderTextColor={
                  isDark ? '#71717A' : '#A1A1AA'
                }
                style={[
                  styles.input,
                  styles.inputMultiline,
                  {
                    backgroundColor:
                      isDark ? '#27272A' : '#F4F4F5',
                    borderColor:
                      '#000000',
                    color: isDark ? '#FFFFFF' : '#000000',
                  },
                ]}
                multiline
              />

            </ScrollView>

            {/* FIXED SAVE BUTTON */}
            <View
              style={[
                styles.saveFooter,
                {
                  backgroundColor: isDark ? '#18181B' : '#FFFFFF',
                  borderTopColor: '#000000',
                },
              ]}
            >
              <Pressable
                disabled={saving}
                onPress={savePlant}
                style={({ pressed }) => [
                  styles.saveButton,
                  {
                    backgroundColor: '#000000',
                    borderWidth: 2,
                    borderColor: pageBg,
                  },
                  saving && {
                    opacity: 0.6,
                  },
                  pressed &&
                    !saving && styles.pressedBtn,
                ]}
              >
                <Text
                  style={[
                    styles.saveText,
                    {
                      color: pageBg,
                    },
                  ]}
                >
                  {saving
                    ? 'Saving...'
                    : editingPlantId
                      ? 'Save changes'
                      : 'Add plant'}
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* PLANT DETAIL MODAL */}

      <Modal
        visible={!!detailOpen}
        transparent
        animationType="fade"
        onRequestClose={() =>
          setDetailOpen(null)
        }
      >
        <Pressable style={styles.centeredModalBackdrop} onPress={() => setDetailOpen(null)}>
          <Pressable
            style={[
              styles.centeredModalCard,
              {
                backgroundColor: isDark ? '#18181B' : '#FFFFFF',
              },
            ]}
            onPress={(e) => e.stopPropagation()}
          >
            {detailOpen &&
              (() => {
                const plant =
                  detailOpen;

                const due =
                  prettyDue(plant);

                const isWatering =
                  wateringId ===
                  plant.id;

                const isDeleting =
                  deletingId ===
                  plant.id;

                return (
                  <>
                    <View
                      style={
                        styles.modalTitleRow
                      }
                    >
                      <View
                        style={
                          styles.detailTitleWrap
                        }
                      >
                        <Text
                          style={[
                            styles.modalTitle,
                            {
                              color: pageBg,
                            },
                          ]}
                          numberOfLines={2}
                        >
                          {plant.name}
                        </Text>

                        {plant.species ? (
                          <Text
                            style={[
                              styles.detailSpecies,
                              {
                                color: isDark ? '#A1A1AA' : '#52525B',
                              },
                            ]}
                          >
                            {plant.species}
                          </Text>
                        ) : null}
                      </View>

                      <Pressable
                        onPress={() =>
                          setDetailOpen(
                            null
                          )
                        }
                        hitSlop={12}
                      >
                        <X
                          color={isDark ? '#FFFFFF' : '#000000'}
                          size={21}
                          strokeWidth={2.5}
                        />
                      </Pressable>
                    </View>

                    {/* DETAILS */}

                    <View
                      style={
                        styles.detailSection
                      }
                    >
                      <View
                        style={
                          styles.detailLine
                        }
                      >
                        <Droplets
                          color={
                            due.overdue
                              ? '#EF4444'
                              : pageBg
                          }
                          size={18}
                        />

                        <Text
                          style={[
                            styles.detailText,
                            {
                              color:
                                due.overdue
                                  ? '#EF4444'
                                  : (isDark ? '#FFFFFF' : '#000000'),
                            },
                          ]}
                        >
                          {due.label}
                        </Text>
                      </View>

                      <View
                        style={
                          styles.detailLine
                        }
                      >
                        <Sun
                          color={isDark ? '#A1A1AA' : '#52525B'}
                          size={18}
                        />

                        <Text
                          style={[
                            styles.detailText,
                            {
                              color: isDark ? '#FFFFFF' : '#000000',
                            },
                          ]}
                        >
                          {plant.sunlight}{' '}
                          light
                        </Text>
                      </View>

                      <View
                        style={
                          styles.detailLine
                        }
                      >
                        <Sprout
                          color={isDark ? '#A1A1AA' : '#52525B'}
                          size={18}
                        />

                        <Text
                          style={[
                            styles.detailText,
                            {
                              color: isDark ? '#FFFFFF' : '#000000',
                            },
                          ]}
                        >
                          Water every{' '}
                          {
                            plant.watering_interval_days
                          }{' '}
                          days
                        </Text>
                      </View>

                      {plant.last_watered_on ? (
                        <Text
                          style={[
                            styles.detailSub,
                            {
                              color: isDark ? '#A1A1AA' : '#52525B',
                            },
                          ]}
                        >
                          Last watered:{' '}
                          {displayDate(
                            plant.last_watered_on
                          )}
                        </Text>
                      ) : (
                        <Text
                          style={[
                            styles.detailSub,
                            {
                              color: isDark ? '#A1A1AA' : '#52525B',
                            },
                          ]}
                        >
                          No watering
                          recorded yet
                        </Text>
                      )}

                      {due.nextDate && (
                        <Text
                          style={[
                            styles.detailSub,
                            {
                              color: isDark ? '#A1A1AA' : '#52525B',
                            },
                          ]}
                        >
                          Next watering:{' '}
                          {displayDate(
                            due.nextDate
                          )}
                        </Text>
                      )}

                      {plant.notes ? (
                        <Text
                          style={[
                            styles.detailNotes,
                            {
                              color: isDark ? '#A1A1AA' : '#52525B',
                            },
                          ]}
                        >
                          {plant.notes}
                        </Text>
                      ) : null}
                    </View>

                    {/* WATER + DELETE */}

                    <View
                      style={
                        styles.detailActions
                      }
                    >
                      <Pressable
                        disabled={
                          isWatering ||
                          isDeleting
                        }
                        onPress={() =>
                          waterNow(plant)
                        }
                        style={({ pressed }) => [
                          styles.detailAction,
                          {
                            backgroundColor: '#000000',
                            borderWidth: 2,
                            borderColor: pageBg,
                          },
                          (isWatering ||
                            isDeleting) && {
                            opacity: 0.55,
                          },
                          pressed &&
                            !isWatering &&
                            !isDeleting && styles.pressedBtn,
                        ]}
                      >
                        <Droplets
                          color={pageBg}
                          size={17}
                          strokeWidth={2.4}
                        />

                        <Text
                          style={[
                            styles.detailActionText,
                            {
                              color: pageBg,
                            },
                          ]}
                        >
                          {isWatering
                            ? 'Watering...'
                            : 'Water'}
                        </Text>
                      </Pressable>

                      <Pressable
                        disabled={
                          isWatering ||
                          isDeleting
                        }
                        onPress={() =>
                          confirmDeletePlant(
                            plant
                          )
                        }
                        style={({ pressed }) => [
                          styles.detailAction,
                          styles.deleteAction,
                          {
                            backgroundColor: isDark ? '#121212' : '#FFFFFF',
                            borderWidth: 2,
                            borderColor: '#EF4444',
                          },
                          (isWatering ||
                            isDeleting) && {
                            opacity: 0.55,
                          },
                          pressed &&
                            !isWatering &&
                            !isDeleting && styles.pressedBtn,
                        ]}
                      >
                        <Trash2
                          color="#EF4444"
                          size={17}
                          strokeWidth={2.4}
                        />

                        <Text
                          style={
                            styles.deleteText
                          }
                        >
                          {isDeleting
                            ? 'Deleting...'
                            : 'Delete'}
                        </Text>
                      </Pressable>
                    </View>
                  </>
                );
              })()}
          </Pressable>
        </Pressable>
      </Modal>

      {/* DELETE CONFIRMATION MODAL */}

      <Modal
        visible={!!deleteTarget}
        transparent
        animationType="fade"
        onRequestClose={() =>
          setDeleteTarget(null)
        }
      >
        <Pressable
          style={styles.centeredModalBackdrop}
          onPress={() => setDeleteTarget(null)}
        >
          <Pressable
            style={[
              styles.centeredModalCard,
              {
                backgroundColor: isDark ? '#18181B' : '#FFFFFF',
                maxWidth: 360,
              },
            ]}
            onPress={(e) => e.stopPropagation()}
          >
            <View
              style={
                styles.confirmIcon
              }
            >
              <Trash2
                color="#EF4444"
                size={22}
                strokeWidth={2.4}
              />
            </View>

            <Text
              style={[
                styles.confirmTitle,
                {
                  color: isDark ? '#FFFFFF' : '#000000',
                },
              ]}
            >
              Delete plant?
            </Text>

            <Text
              style={[
                styles.confirmText,
                {
                  color: isDark ? '#A1A1AA' : '#52525B',
                },
              ]}
            >
              {deleteTarget?.name} will
              be permanently removed.
            </Text>

            <View
              style={
                styles.confirmActions
              }
            >
              <Pressable
                onPress={() =>
                  setDeleteTarget(null)
                }
                style={({ pressed }) => [
                  styles.confirmButton,
                  {
                    backgroundColor: isDark ? '#27272A' : '#F4F4F5',
                    borderWidth: 2,
                    borderColor: '#000000',
                  },
                  pressed && styles.pressedBtn,
                ]}
              >
                <Text
                  style={[
                    styles.confirmCancelText,
                    {
                      color: isDark ? '#FFFFFF' : '#000000',
                    },
                  ]}
                >
                  Cancel
                </Text>
              </Pressable>

              <Pressable
                disabled={!!deletingId}
                onPress={() => {
                  if (deleteTarget) {
                    deletePlant(
                      deleteTarget
                    );
                  }
                }}
                style={({ pressed }) => [
                  styles.confirmButton,
                  {
                    backgroundColor: '#000000',
                    borderWidth: 2,
                    borderColor: '#EF4444',
                  },
                  deletingId && {
                    opacity: 0.55,
                  },
                  pressed &&
                    !deletingId && styles.pressedBtn,
                ]}
              >
                <Text
                  style={[
                    styles.confirmDeleteText,
                    { color: '#EF4444' },
                  ]}
                >
                  {deletingId
                    ? 'Deleting...'
                    : 'Delete'}
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
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
    paddingBottom: 10,
    zIndex: 100,
  },

  headerBack: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#000000',
  },

  headerBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuShade: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'flex-end',
    paddingTop: 64,
    paddingRight: 20,
  },

  menuCard: {
    borderRadius: 12,
    borderWidth: 3,
    paddingVertical: 6,
    minWidth: 150,
  },

  menuItem: {
    paddingVertical: 12,
    paddingHorizontal: 16,
  },

  menuItemText: {
    fontFamily: 'Poppins-Bold',
    fontSize: 14,
  },

  headerTitle: {
    fontFamily: 'Poppins-ExtraBold',
    fontSize: 20,
    letterSpacing: 1,
  },

  content: {
    padding: 18,
    paddingBottom: 50,
  },

  error: {
    fontFamily: 'Poppins-Bold',
    fontSize: 13,
    marginBottom: 10,
  },

  empty: {
    paddingVertical: 70,
    alignItems: 'center',
    paddingHorizontal: 30,
  },

  emptyIcon: {
    width: 58,
    height: 58,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    borderWidth: 2,
  },

  emptyTitle: {
    fontFamily: 'Poppins-ExtraBold',
    fontSize: 18,
    marginBottom: 7,
  },

  emptyText: {
    fontFamily: 'Poppins-Medium',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 21,
  },

  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },

  cardContainer: {
    width: '48%',
    position: 'relative',
    marginBottom: 16,
  },

  cardShadowBackdrop: {
    position: 'absolute',
    top: 4,
    left: 4,
    right: -4,
    bottom: -4,
    backgroundColor: '#000000',
    borderRadius: 16,
  },

  card: {
    borderRadius: 16,
    borderWidth: 3,
    padding: 12,
    minHeight: 160,
    justifyContent: 'space-between',
  },

  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },

  cardIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#000000',
  },

  editPenButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },

  cardBodyPressable: {
    borderRadius: 10,
  },

  plantName: {
    fontFamily: 'Poppins-ExtraBold',
    fontSize: 15,
  },

  plantSpecies: {
    fontFamily: 'Poppins-Medium',
    fontSize: 11,
    marginTop: 2,
    marginBottom: 6,
  },

  duePill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginTop: 6,
    borderWidth: 1.5,
    borderColor: '#000000',
  },

  duePillOverdue: {
    backgroundColor: '#EF4444',
  },

  duePillText: {
    fontFamily: 'Poppins-Bold',
    fontSize: 10,
  },

  cardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },

  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },

  metaText: {
    fontFamily: 'Poppins-Medium',
    fontSize: 10,
  },

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

  centeredModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },

  centeredModalCard: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 24,
    borderWidth: 3,
    borderColor: '#000000',
    paddingTop: 22,
    paddingBottom: 26,
    paddingHorizontal: 22,
    maxHeight: '85%',
    shadowColor: '#000000',
    shadowOffset: { width: 6, height: 6 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 8,
  },

  modalTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },

  modalTitle: {
    fontFamily: 'Poppins-ExtraBold',
    fontSize: 20,
    flex: 1,
    marginRight: 12,
  },

  modalScroll: {
    flexGrow: 0,
    flexShrink: 1,
  },

  saveFooter: {
    paddingTop: 12,
    paddingBottom: 0,
    borderTopWidth: 2,
    marginTop: 10,
  },

  detailTitleWrap: {
    flex: 1,
    marginRight: 12,
  },

  detailSpecies: {
    fontFamily: 'Poppins-Medium',
    fontSize: 13,
    marginTop: 4,
  },

  label: {
    fontFamily: 'Poppins-Bold',
    fontSize: 11,
    letterSpacing: 0.5,
    marginTop: 12,
    marginBottom: 6,
  },

  input: {
    borderWidth: 2,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: 'Poppins-Medium',
    fontSize: 14,
  },

  inputMultiline: {
    minHeight: 80,
    textAlignVertical: 'top',
  },

  frequencyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },

  frequencyText: {
    fontFamily: 'Poppins-Bold',
    fontSize: 14,
  },

  intervalInput: {
    width: 70,
    height: 42,
    borderWidth: 2,
    borderRadius: 10,
    paddingHorizontal: 12,
    textAlign: 'center',
    fontFamily: 'Poppins-Bold',
    fontSize: 14,
  },

  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },

  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 2,
  },

  chipText: {
    fontFamily: 'Poppins-Bold',
    fontSize: 12,
  },

  saveButton: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 10,
  },

  saveText: {
    fontFamily: 'Poppins-ExtraBold',
    fontSize: 15,
    letterSpacing: 0.5,
  },

  detailSection: {
    marginTop: 8,
    gap: 12,
    paddingVertical: 8,
  },

  detailLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },

  detailText: {
    fontFamily: 'Poppins-Bold',
    fontSize: 14,
  },

  detailSub: {
    fontFamily: 'Poppins-Medium',
    fontSize: 13,
    marginLeft: 28,
    lineHeight: 20,
  },

  detailNotes: {
    fontFamily: 'Poppins-Medium',
    fontSize: 14,
    lineHeight: 21,
    marginTop: 8,
  },

  detailActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },

  detailAction: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },

  deleteAction: {
    borderWidth: 2,
  },

  deleteText: {
    fontFamily: 'Poppins-ExtraBold',
    fontSize: 14,
    color: '#EF4444',
  },

  detailActionText: {
    fontFamily: 'Poppins-ExtraBold',
    fontSize: 14,
  },

  confirmIcon: {
    width: 46,
    height: 46,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FBEAE8',
    borderWidth: 2,
    borderColor: '#EF4444',
    marginBottom: 16,
  },

  confirmTitle: {
    fontFamily: 'Poppins-ExtraBold',
    fontSize: 19,
    marginBottom: 8,
  },

  confirmText: {
    fontFamily: 'Poppins-Medium',
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 22,
  },

  confirmActions: {
    flexDirection: 'row',
    gap: 10,
  },

  confirmButton: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },

  confirmCancelText: {
    fontFamily: 'Poppins-ExtraBold',
    fontSize: 14,
  },

  confirmDeleteText: {
    fontFamily: 'Poppins-ExtraBold',
    fontSize: 14,
  },
});