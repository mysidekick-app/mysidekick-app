import { useMemo, useState } from 'react';

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
  Bell,
  Camera,
  Check,
  ChevronRight,
  CircleUserRound,
  LockKeyhole,
  LogOut,
  Moon,
  Pencil,
  RotateCcw,
  ShieldCheck,
  Volume2,
  X,
} from 'lucide-react-native';

import {
  useApp,
  AccentFamily,
  accentPalettes,
  ThemeMode,
} from '@/components/AppProvider';

import { CurrencyPickerModal } from '@/components/CurrencyPickerModal';
import { getCurrency } from '@/components/currencies';

const MAX_BIO_WORDS = 30;
const MAX_TITLE_CHARS = 20;

const FONT = 'Poppins-Regular';
const FONT_MED = 'Poppins-Medium';
const FONT_SEMI = 'Poppins-SemiBold';
const FONT_BOLD = 'Poppins-Bold';
const FONT_XB = 'Poppins-ExtraBold';

type TimezoneGroup =
  | 'Africa'
  | 'Americas'
  | 'Asia'
  | 'Europe'
  | 'Middle East'
  | 'Oceania';

type TimezoneItem = {
  value: string;
  label: string;
  group: TimezoneGroup;
};

const TIMEZONE_GROUPS: TimezoneGroup[] = [
  'Africa',
  'Americas',
  'Asia',
  'Europe',
  'Middle East',
  'Oceania',
];

const TIMEZONES: TimezoneItem[] = [
  /*
   * AFRICA
   */
  {
    value: 'Africa/Abidjan',
    label: "Abidjan, Côte d'Ivoire",
    group: 'Africa',
  },
  {
    value: 'Africa/Accra',
    label: 'Accra, Ghana',
    group: 'Africa',
  },
  {
    value: 'Africa/Addis_Ababa',
    label: 'Addis Ababa, Ethiopia',
    group: 'Africa',
  },
  {
    value: 'Africa/Cairo',
    label: 'Cairo, Egypt',
    group: 'Africa',
  },
  {
    value: 'Africa/Casablanca',
    label: 'Casablanca, Morocco',
    group: 'Africa',
  },
  {
    value: 'Africa/Dar_es_Salaam',
    label: 'Dar es Salaam, Tanzania',
    group: 'Africa',
  },
  {
    value: 'Africa/Johannesburg',
    label: 'Johannesburg, South Africa',
    group: 'Africa',
  },
  {
    value: 'Africa/Kampala',
    label: 'Kampala, Uganda',
    group: 'Africa',
  },
  {
    value: 'Africa/Lagos',
    label: 'Lagos, Nigeria',
    group: 'Africa',
  },
  {
    value: 'Africa/Maputo',
    label: 'Maputo, Mozambique',
    group: 'Africa',
  },
  {
    value: 'Africa/Nairobi',
    label: 'Nairobi, Kenya',
    group: 'Africa',
  },
  {
    value: 'Africa/Tripoli',
    label: 'Tripoli, Libya',
    group: 'Africa',
  },
  {
    value: 'Africa/Tunis',
    label: 'Tunis, Tunisia',
    group: 'Africa',
  },

  /*
   * AMERICAS
   */
  {
    value: 'America/Anchorage',
    label: 'Anchorage, United States',
    group: 'Americas',
  },
  {
    value: 'America/Argentina/Buenos_Aires',
    label: 'Buenos Aires, Argentina',
    group: 'Americas',
  },
  {
    value: 'America/Bogota',
    label: 'Bogotá, Colombia',
    group: 'Americas',
  },
  {
    value: 'America/Chicago',
    label: 'Chicago, United States',
    group: 'Americas',
  },
  {
    value: 'America/Denver',
    label: 'Denver, United States',
    group: 'Americas',
  },
  {
    value: 'America/Halifax',
    label: 'Halifax, Canada',
    group: 'Americas',
  },
  {
    value: 'America/Lima',
    label: 'Lima, Peru',
    group: 'Americas',
  },
  {
    value: 'America/Los_Angeles',
    label: 'Los Angeles, United States',
    group: 'Americas',
  },
  {
    value: 'America/Mexico_City',
    label: 'Mexico City, Mexico',
    group: 'Americas',
  },
  {
    value: 'America/New_York',
    label: 'New York, United States',
    group: 'Americas',
  },
  {
    value: 'America/Phoenix',
    label: 'Phoenix, United States',
    group: 'Americas',
  },
  {
    value: 'America/Santiago',
    label: 'Santiago, Chile',
    group: 'Americas',
  },
  {
    value: 'America/Sao_Paulo',
    label: 'São Paulo, Brazil',
    group: 'Americas',
  },
  {
    value: 'America/Toronto',
    label: 'Toronto, Canada',
    group: 'Americas',
  },
  {
    value: 'America/Vancouver',
    label: 'Vancouver, Canada',
    group: 'Americas',
  },

  /*
   * ASIA
   */
  {
    value: 'Asia/Almaty',
    label: 'Almaty, Kazakhstan',
    group: 'Asia',
  },
  {
    value: 'Asia/Bangkok',
    label: 'Bangkok, Thailand',
    group: 'Asia',
  },
  {
    value: 'Asia/Colombo',
    label: 'Colombo, Sri Lanka',
    group: 'Asia',
  },
  {
    value: 'Asia/Dhaka',
    label: 'Dhaka, Bangladesh',
    group: 'Asia',
  },
  {
    value: 'Asia/Hong_Kong',
    label: 'Hong Kong',
    group: 'Asia',
  },
  {
    value: 'Asia/Jakarta',
    label: 'Jakarta, Indonesia',
    group: 'Asia',
  },
  {
    value: 'Asia/Karachi',
    label: 'Karachi, Pakistan',
    group: 'Asia',
  },
  {
    value: 'Asia/Kathmandu',
    label: 'Kathmandu, Nepal',
    group: 'Asia',
  },
  {
    value: 'Asia/Kolkata',
    label: 'Kolkata, India',
    group: 'Asia',
  },
  {
    value: 'Asia/Manila',
    label: 'Manila, Philippines',
    group: 'Asia',
  },
  {
    value: 'Asia/Seoul',
    label: 'Seoul, South Korea',
    group: 'Asia',
  },
  {
    value: 'Asia/Shanghai',
    label: 'Shanghai, China',
    group: 'Asia',
  },
  {
    value: 'Asia/Singapore',
    label: 'Singapore',
    group: 'Asia',
  },
  {
    value: 'Asia/Taipei',
    label: 'Taipei, Taiwan',
    group: 'Asia',
  },
  {
    value: 'Asia/Tokyo',
    label: 'Tokyo, Japan',
    group: 'Asia',
  },

  /*
   * EUROPE
   */
  {
    value: 'Europe/Amsterdam',
    label: 'Amsterdam, Netherlands',
    group: 'Europe',
  },
  {
    value: 'Europe/Athens',
    label: 'Athens, Greece',
    group: 'Europe',
  },
  {
    value: 'Europe/Berlin',
    label: 'Berlin, Germany',
    group: 'Europe',
  },
  {
    value: 'Europe/Brussels',
    label: 'Brussels, Belgium',
    group: 'Europe',
  },
  {
    value: 'Europe/Bucharest',
    label: 'Bucharest, Romania',
    group: 'Europe',
  },
  {
    value: 'Europe/Copenhagen',
    label: 'Copenhagen, Denmark',
    group: 'Europe',
  },
  {
    value: 'Europe/Dublin',
    label: 'Dublin, Ireland',
    group: 'Europe',
  },
  {
    value: 'Europe/Helsinki',
    label: 'Helsinki, Finland',
    group: 'Europe',
  },
  {
    value: 'Europe/Istanbul',
    label: 'Istanbul, Türkiye',
    group: 'Europe',
  },
  {
    value: 'Europe/Lisbon',
    label: 'Lisbon, Portugal',
    group: 'Europe',
  },
  {
    value: 'Europe/London',
    label: 'London, United Kingdom',
    group: 'Europe',
  },
  {
    value: 'Europe/Madrid',
    label: 'Madrid, Spain',
    group: 'Europe',
  },
  {
    value: 'Europe/Oslo',
    label: 'Oslo, Norway',
    group: 'Europe',
  },
  {
    value: 'Europe/Paris',
    label: 'Paris, France',
    group: 'Europe',
  },
  {
    value: 'Europe/Prague',
    label: 'Prague, Czechia',
    group: 'Europe',
  },
  {
    value: 'Europe/Rome',
    label: 'Rome, Italy',
    group: 'Europe',
  },
  {
    value: 'Europe/Stockholm',
    label: 'Stockholm, Sweden',
    group: 'Europe',
  },
  {
    value: 'Europe/Vienna',
    label: 'Vienna, Austria',
    group: 'Europe',
  },
  {
    value: 'Europe/Warsaw',
    label: 'Warsaw, Poland',
    group: 'Europe',
  },
  {
    value: 'Europe/Zurich',
    label: 'Zurich, Switzerland',
    group: 'Europe',
  },

  /*
   * MIDDLE EAST
   *
   * Some IANA timezone identifiers use
   * Asia/ even though we display them
   * under the Middle East grouping.
   */
  {
    value: 'Asia/Amman',
    label: 'Amman, Jordan',
    group: 'Middle East',
  },
  {
    value: 'Asia/Baghdad',
    label: 'Baghdad, Iraq',
    group: 'Middle East',
  },
  {
    value: 'Asia/Beirut',
    label: 'Beirut, Lebanon',
    group: 'Middle East',
  },
  {
    value: 'Asia/Damascus',
    label: 'Damascus, Syria',
    group: 'Middle East',
  },
  {
    value: 'Asia/Dubai',
    label: 'Dubai, United Arab Emirates',
    group: 'Middle East',
  },
  {
    value: 'Asia/Jerusalem',
    label: 'Jerusalem',
    group: 'Middle East',
  },
  {
    value: 'Asia/Kuwait',
    label: 'Kuwait City, Kuwait',
    group: 'Middle East',
  },
  {
    value: 'Asia/Muscat',
    label: 'Muscat, Oman',
    group: 'Middle East',
  },
  {
    value: 'Asia/Qatar',
    label: 'Doha, Qatar',
    group: 'Middle East',
  },
  {
    value: 'Asia/Riyadh',
    label: 'Riyadh, Saudi Arabia',
    group: 'Middle East',
  },
  {
    value: 'Asia/Tehran',
    label: 'Tehran, Iran',
    group: 'Middle East',
  },

  /*
   * OCEANIA
   */
  {
    value: 'Australia/Adelaide',
    label: 'Adelaide, Australia',
    group: 'Oceania',
  },
  {
    value: 'Australia/Brisbane',
    label: 'Brisbane, Australia',
    group: 'Oceania',
  },
  {
    value: 'Australia/Darwin',
    label: 'Darwin, Australia',
    group: 'Oceania',
  },
  {
    value: 'Australia/Melbourne',
    label: 'Melbourne, Australia',
    group: 'Oceania',
  },
  {
    value: 'Australia/Perth',
    label: 'Perth, Australia',
    group: 'Oceania',
  },
  {
    value: 'Australia/Sydney',
    label: 'Sydney, Australia',
    group: 'Oceania',
  },
  {
    value: 'Pacific/Auckland',
    label: 'Auckland, New Zealand',
    group: 'Oceania',
  },
  {
    value: 'Pacific/Fiji',
    label: 'Fiji',
    group: 'Oceania',
  },
  {
    value: 'Pacific/Guam',
    label: 'Guam',
    group: 'Oceania',
  },
  {
    value: 'Pacific/Honolulu',
    label: 'Honolulu, United States',
    group: 'Oceania',
  },
];

const accentChoices: {
  key: AccentFamily;
  label: string;
}[] = [
  {
    key: 'black',
    label: 'Black',
  },
  {
    key: 'red',
    label: 'Red',
  },
  {
    key: 'orange',
    label: 'Orange',
  },
  {
    key: 'mustard',
    label: 'Mustard',
  },
  {
    key: 'green',
    label: 'Green',
  },
  {
    key: 'blue',
    label: 'Blue',
  },
  {
    key: 'indigo',
    label: 'Indigo',
  },
  {
    key: 'violet',
    label: 'Violet',
  },
];

type SettingKey =
  | 'account'
  | 'display'
  | 'password'
  | 'privacy'
  | 'reset'
  | null;

export default function ProfileScreen() {
  const {
    display_name,
    username,
    title,
    bio,
    accent,
    accentForeground,
    accentWash,
    updateSettings,
    isDark,
    onAccent,
    currency_code,
    timezone,
    theme_mode,
    accent_family,
  } = useApp();

  const [editing, setEditing] =
    useState(false);

  const [name, setName] =
    useState(display_name);

  const [profileTitle, setProfileTitle] =
    useState(title);

  const [profileBio, setProfileBio] =
    useState(bio);

  const [openSetting, setOpenSetting] =
    useState<SettingKey>(null);

  const [currencyOpen, setCurrencyOpen] =
    useState(false);

  const [timezoneOpen, setTimezoneOpen] =
    useState(false);

  const [timezoneSearch, setTimezoneSearch] =
    useState('');

  const currency =
    getCurrency(currency_code);

  const selectedTimezone =
    TIMEZONES.find(
      (item) =>
        item.value === timezone
    );

  const filteredTimezoneGroups =
    useMemo(() => {
      const search =
        timezoneSearch
          .trim()
          .toLowerCase();

      return TIMEZONE_GROUPS.map(
        (group) => ({
          group,

          items: TIMEZONES.filter(
            (item) => {
              if (
                item.group !== group
              ) {
                return false;
              }

              if (!search) {
                return true;
              }

              return (
                item.label
                  .toLowerCase()
                  .includes(search) ||
                item.value
                  .toLowerCase()
                  .includes(search)
              );
            }
          ),
        })
      ).filter(
        (section) =>
          section.items.length > 0
      );
    }, [timezoneSearch]);

  const clampBio = (
    text: string
  ) => {
    const words = text
      .trim()
      .split(/\s+/)
      .filter(Boolean);

    if (
      words.length <=
      MAX_BIO_WORDS
    ) {
      return text;
    }

    return words
      .slice(0, MAX_BIO_WORDS)
      .join(' ');
  };

  const clampTitle = (
    text: string
  ) => {
    return text.slice(
      0,
      MAX_TITLE_CHARS
    );
  };

  const bioWordCount =
    profileBio
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .length;

  const titleCharacterCount =
    profileTitle.length;

  const save = async () => {
    await updateSettings({
      display_name:
        name.trim() || 'User',

      title:
        clampTitle(profileTitle),

      bio:
        clampBio(profileBio),
    });

    setEditing(false);
  };

  const C = isDark
    ? {
        bg: '#090909',
        card: '#151515',
        border: '#2A2A2A',
        text: '#F4F2EE',
        muted: '#AAA59D',
        input: '#1E1E1E',
        inputBorder: '#363636',
        divider: '#292929',
      }
    : {
        bg: '#FBFAF8',
        card: '#FFFFFF',
        border: '#ECE9E4',
        text: '#27241F',
        muted: '#8F8A82',
        input: '#FCFBF9',
        inputBorder: '#E0DDD7',
        divider: '#F1EFEB',
      };

  const settingRows: {
    key: SettingKey;
    label: string;
    icon: typeof Bell;
  }[] = [
    {
      key: 'account',
      label: 'Account',
      icon: CircleUserRound,
    },
    {
      key: 'display',
      label: 'Display',
      icon: Volume2,
    },
    {
      key: 'password',
      label: 'Password',
      icon: LockKeyhole,
    },
    {
      key: 'privacy',
      label: 'Privacy Policy',
      icon: ShieldCheck,
    },
    {
      key: 'reset',
      label: 'Reset App',
      icon: RotateCcw,
    },
  ];

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
      <View
        style={[
          styles.header,
          {
            borderBottomColor:
              C.border,
          },
        ]}
      >
        <View
          style={
            styles.headerSpacer
          }
        />
      </View>

      <ScrollView
        contentContainerStyle={
          styles.content
        }
        showsVerticalScrollIndicator={
          false
        }
      >
        {/* PROFILE CARD */}

        <View
          style={[
            styles.profileCard,
            {
              backgroundColor:
                C.card,
              borderColor:
                C.border,
            },
          ]}
        >
          <View
            style={
              styles.avatarRow
            }
          >
            <View
              style={[
                styles.avatar,
                {
                  backgroundColor:
                    accentWash,
                  borderColor:
                    accent.light,
                },
              ]}
            >
              <Text
                style={[
                  styles.avatarText,
                  {
                    color:
                      accentForeground,
                  },
                ]}
              >
                {(
                  display_name ||
                  'U'
                )
                  .slice(0, 1)
                  .toUpperCase()}
              </Text>

              <Pressable
                style={[
                  styles.camera,
                  {
                    backgroundColor:
                      accentForeground,
                  },
                ]}
              >
                <Camera
                  color="#FFF"
                  size={14}
                />
              </Pressable>
            </View>

            {editing ? (
              <View
                style={
                  styles.formInline
                }
              >
                <Text
                  style={[
                    styles.fieldLabel,
                    {
                      color:
                        C.muted,
                    },
                  ]}
                >
                  Name
                </Text>

                <TextInput
                  value={name}
                  onChangeText={
                    setName
                  }
                  style={[
                    styles.input,
                    {
                      backgroundColor:
                        C.input,
                      borderColor:
                        C.inputBorder,
                      color:
                        C.text,
                    },
                  ]}
                  placeholder="Your name"
                  placeholderTextColor={
                    C.muted
                  }
                  autoFocus
                />

                <View
                  style={
                    styles.titleLabelRow
                  }
                >
                  <Text
                    style={[
                      styles.fieldLabel,
                      {
                        color:
                          C.muted,
                      },
                    ]}
                  >
                    Title / Tags
                  </Text>

                  <Text
                    style={[
                      styles.characterCount,
                      {
                        color:
                          C.muted,
                      },
                    ]}
                  >
                    {
                      titleCharacterCount
                    }
                    /
                    {
                      MAX_TITLE_CHARS
                    }
                  </Text>
                </View>

                <TextInput
                  value={
                    profileTitle
                  }
                  onChangeText={(
                    text
                  ) =>
                    setProfileTitle(
                      clampTitle(
                        text
                      )
                    )
                  }
                  maxLength={
                    MAX_TITLE_CHARS
                  }
                  style={[
                    styles.input,
                    {
                      backgroundColor:
                        C.input,
                      borderColor:
                        C.inputBorder,
                      color:
                        C.text,
                    },
                  ]}
                  placeholder="How would you describe yourself?"
                  placeholderTextColor={
                    C.muted
                  }
                />
              </View>
            ) : (
              <View
                style={
                  styles.profileCopy
                }
              >
                <Text
                  style={[
                    styles.name,
                    {
                      color:
                        C.text,
                    },
                  ]}
                >
                  {display_name}
                </Text>

                {/* USERNAME IS BELOW PROFILE NAME */}

                {username ? (
                  <Text
                    style={[
                      styles.username,
                      {
                        color:
                          C.muted,
                      },
                    ]}
                  >
                    @{username}
                  </Text>
                ) : null}

                {title ? (
                  <Text
                    style={[
                      styles.profileTitleText,
                      {
                        color:
                          accentForeground,
                      },
                    ]}
                  >
                    {title}
                  </Text>
                ) : null}
              </View>
            )}
          </View>

          {editing ? (
            <View
              style={
                styles.bioForm
              }
            >
              <View
                style={
                  styles.bioLabelRow
                }
              >
                <Text
                  style={[
                    styles.fieldLabel,
                    {
                      color:
                        C.muted,
                    },
                  ]}
                >
                  Bio
                </Text>

                <Text
                  style={[
                    styles.wordCount,
                    {
                      color:
                        C.muted,
                    },
                  ]}
                >
                  {bioWordCount}/
                  {MAX_BIO_WORDS}
                </Text>
              </View>

              <TextInput
                value={profileBio}
                onChangeText={(
                  text
                ) =>
                  setProfileBio(
                    clampBio(text)
                  )
                }
                style={[
                  styles.input,
                  styles.bio,
                  {
                    backgroundColor:
                      C.input,
                    borderColor:
                      C.inputBorder,
                    color:
                      C.text,
                  },
                ]}
                multiline
                placeholder="A little about you"
                placeholderTextColor={
                  C.muted
                }
              />
            </View>
          ) : (
            <Text
              style={[
                styles.bioText,
                {
                  color:
                    C.muted,
                },
              ]}
            >
              {bio}
            </Text>
          )}

          <Pressable
            onPress={
              editing
                ? save
                : () => {
                    setName(
                      display_name
                    );

                    setProfileTitle(
                      title
                    );

                    setProfileBio(
                      bio
                    );

                    setEditing(
                      true
                    );
                  }
            }
            style={[
              styles.primaryButton,
              {
                backgroundColor:
                  accentForeground,
              },
            ]}
          >
            {editing ? (
              <Check
                color="#FFF"
                size={17}
              />
            ) : (
              <Pencil
                color="#FFF"
                size={16}
              />
            )}

            <Text
              style={[
                styles.primaryText,
                {
                  color:
                    onAccent,
                },
              ]}
            >
              {editing
                ? 'Save changes'
                : 'Edit Profile'}
            </Text>
          </Pressable>

          <View
            style={
              styles.logoutWrap
            }
          >
            <Pressable
              style={
                styles.logout
              }
            >
              <LogOut
                color={C.muted}
                size={16}
              />

              <Text
                style={[
                  styles.logoutText,
                  {
                    color:
                      C.muted,
                  },
                ]}
              >
                Logout
              </Text>
            </Pressable>
          </View>
        </View>

        {/* SETTINGS */}

        <Text
          style={[
            styles.settingsTitle,
            {
              color:
                C.muted,
            },
          ]}
        >
          SETTINGS
        </Text>

        <View
          style={[
            styles.settingsCard,
            {
              backgroundColor:
                C.card,
              borderColor:
                C.border,
            },
          ]}
        >
          {settingRows.map(
            (
              {
                key,
                label,
                icon: Icon,
              },
              i
            ) => (
              <Pressable
                key={key}
                onPress={() =>
                  setOpenSetting(
                    key
                  )
                }
                style={[
                  styles.settingRow,
                  {
                    borderBottomColor:
                      C.divider,
                  },

                  i ===
                    settingRows.length -
                      1 && {
                    borderBottomWidth: 0,
                  },
                ]}
              >
                <View
                  style={[
                    styles.rowIcon,
                    {
                      backgroundColor:
                        isDark
                          ? '#292929'
                          : '#F3F2EF',
                    },
                  ]}
                >
                  <Icon
                    color={
                      isDark &&
                      accent_family === 'black'
                        ? '#FFFFFF'
                        : accentForeground
                    }
                    size={17}
                  />
                </View>

                <Text
                  style={[
                    styles.rowLabel,
                    {
                      color:
                        C.text,
                    },
                  ]}
                >
                  {label}
                </Text>

                <ChevronRight
                  color={
                    isDark
                      ? '#77736C'
                      : '#B2AEA7'
                  }
                  size={17}
                />
              </Pressable>
            )
          )}
        </View>
      </ScrollView>

      {/* ACCOUNT SHEET */}

      <Modal
        visible={
          openSetting ===
          'account'
        }
        transparent
        animationType="slide"
        onRequestClose={() =>
          setOpenSetting(null)
        }
      >
        <View
          style={
            styles.modalShade
          }
        >
          <View
            style={[
              styles.sheet,
              {
                backgroundColor:
                  C.card,
              },
            ]}
          >
            <View
              style={
                styles.sheetHeader
              }
            >
              <Text
                style={[
                  styles.sheetTitle,
                  {
                    color:
                      C.text,
                  },
                ]}
              >
                Account
              </Text>

              <Pressable
                onPress={() =>
                  setOpenSetting(
                    null
                  )
                }
                hitSlop={12}
              >
                <X
                  color={C.muted}
                  size={21}
                />
              </Pressable>
            </View>

            <Text
              style={[
                styles.group,
                {
                  color:
                    C.muted,
                },
              ]}
            >
              PREFERENCES
            </Text>

            {/* CURRENCY */}

            <Pressable
              onPress={() =>
                setCurrencyOpen(
                  true
                )
              }
              style={
                styles.settingRow
              }
            >
              <View
                style={[
                  styles.rowIcon,
                  {
                    backgroundColor:
                      accentForeground,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.currencySymbol,
                    {
                      color:
                        onAccent,
                    },
                  ]}
                >
                  {currency.symbol}
                </Text>
              </View>

              <View
                style={
                  styles.rowCopy
                }
              >
                <Text
                  style={[
                    styles.rowLabel,
                    {
                      color:
                        C.text,
                    },
                  ]}
                >
                  Currency
                </Text>

                <Text
                  style={[
                    styles.rowValue,
                    {
                      color:
                        C.muted,
                    },
                  ]}
                >
                  {currency.name} (
                  {currency.code})
                </Text>
              </View>

              <ChevronRight
                color={
                  isDark
                    ? '#77736C'
                    : '#B2AEA7'
                }
                size={17}
              />
            </Pressable>

            {/* TIMEZONE */}

            <Pressable
              onPress={() => {
                setTimezoneSearch(
                  ''
                );

                setTimezoneOpen(
                  true
                );
              }}
              style={
                styles.settingRow
              }
            >
              <View
                style={[
                  styles.rowIcon,
                  {
                    backgroundColor:
                      accentForeground,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.timezoneIconText,
                    {
                      color:
                        onAccent,
                    },
                  ]}
                >
                  TZ
                </Text>
              </View>

              <View
                style={
                  styles.rowCopy
                }
              >
                <Text
                  style={[
                    styles.rowLabel,
                    {
                      color:
                        C.text,
                    },
                  ]}
                >
                  Timezone
                </Text>

                <Text
                  style={[
                    styles.rowValue,
                    {
                      color:
                        C.muted,
                    },
                  ]}
                  numberOfLines={1}
                >
                  {selectedTimezone
                    ?.label ??
                    timezone}
                </Text>
              </View>

              <ChevronRight
                color={
                  isDark
                    ? '#77736C'
                    : '#B2AEA7'
                }
                size={17}
              />
            </Pressable>

            <Pressable
              onPress={() =>
                setOpenSetting(
                  null
                )
              }
              style={[
                styles.saveButton,
                {
                  backgroundColor:
                    accentForeground,
                },
              ]}
            >
              <Text
                style={[
                  styles.saveText,
                  {
                    color:
                      onAccent,
                  },
                ]}
              >
                Done
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* DISPLAY SHEET */}

      <Modal
        visible={
          openSetting ===
          'display'
        }
        transparent
        animationType="slide"
        onRequestClose={() =>
          setOpenSetting(null)
        }
      >
        <View
          style={
            styles.modalShade
          }
        >
          <View
            style={[
              styles.sheet,
              {
                backgroundColor:
                  C.card,
              },
            ]}
          >
            <View
              style={
                styles.sheetHeader
              }
            >
              <Text
                style={[
                  styles.sheetTitle,
                  {
                    color:
                      C.text,
                  },
                ]}
              >
                Display
              </Text>

              <Pressable
                onPress={() =>
                  setOpenSetting(
                    null
                  )
                }
                hitSlop={12}
              >
                <X
                  color={C.muted}
                  size={21}
                />
              </Pressable>
            </View>

            {/* THEME */}

            <View
              style={[
                styles.subCard,
                {
                  borderColor:
                    C.border,
                },
              ]}
            >
              <View
                style={
                  styles.panelTitleRow
                }
              >
                <Moon
                  color={
                    accentForeground
                  }
                  size={16}
                />

                <Text
                  style={[
                    styles.panelTitleText,
                    {
                      color:
                        C.text,
                    },
                  ]}
                >
                  Theme mode
                </Text>
              </View>

              <View
                style={[
                  styles.modeToggle,
                  {
                    backgroundColor:
                      isDark
                        ? '#1A1A1A'
                        : '#F4F2EE',
                  },
                ]}
              >
                {(
                  [
                    'system',
                    'light',
                    'dark',
                  ] as ThemeMode[]
                ).map(
                  (mode) => (
                    <Pressable
                      key={mode}
                      onPress={() =>
                        updateSettings(
                          {
                            theme_mode:
                              mode,
                          }
                        )
                      }
                      style={[
                        styles.modeOption,
                        theme_mode ===
                          mode && {
                          backgroundColor:
                            accentForeground,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.modeText,
                          {
                            color:
                              C.muted,
                          },

                          theme_mode ===
                            mode && {
                            color:
                              onAccent,
                          },
                        ]}
                      >
                        {mode
                          .charAt(
                            0
                          )
                          .toUpperCase() +
                          mode.slice(
                            1
                          )}
                      </Text>
                    </Pressable>
                  )
                )}
              </View>
            </View>

            {/* ACCENT */}

            <View
              style={[
                styles.subCard,
                {
                  borderColor:
                    C.border,
                },
              ]}
            >
              <Text
                style={[
                  styles.panelLabel,
                  {
                    color:
                      C.text,
                  },
                ]}
              >
                Accent color
              </Text>

              <View
                style={
                  styles.palette
                }
              >
                {accentChoices.map(
                  ({
                    key,
                    label,
                  }) => (
                    <Pressable
                      key={key}
                      onPress={() =>
                        updateSettings(
                          {
                            accent_family:
                              key,
                          }
                        )
                      }
                      style={
                        styles.swatchWrap
                      }
                    >
                      <View
                        style={[
                          styles.swatch,
                          {
                            backgroundColor:
                              accentPalettes[
                                key
                              ]
                                .standard,
                          },

                          accent_family ===
                            key && {
                            borderColor:
                              isDark
                                ? '#FFF'
                                : '#26231F',
                            borderWidth: 3,
                          },
                        ]}
                      >
                        {accent_family ===
                          key && (
                          <Check
                            color="#FFF"
                            size={14}
                            strokeWidth={
                              3
                            }
                          />
                        )}
                      </View>

                      <Text
                        style={[
                          styles.swatchLabel,
                          {
                            color:
                              C.muted,
                          },
                        ]}
                      >
                        {label}
                      </Text>
                    </Pressable>
                  )
                )}
              </View>
            </View>

            <Pressable
              onPress={() =>
                setOpenSetting(
                  null
                )
              }
              style={[
                styles.saveButton,
                {
                  backgroundColor:
                    accentForeground,
                },
              ]}
            >
              <Text
                style={[
                  styles.saveText,
                  {
                    color:
                      onAccent,
                  },
                ]}
              >
                Done
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* PASSWORD SHEET */}

      <Modal
        visible={
          openSetting ===
          'password'
        }
        transparent
        animationType="slide"
        onRequestClose={() =>
          setOpenSetting(null)
        }
      >
        <View
          style={
            styles.modalShade
          }
        >
          <View
            style={[
              styles.sheet,
              {
                backgroundColor:
                  C.card,
              },
            ]}
          >
            <View
              style={
                styles.sheetHeader
              }
            >
              <Text
                style={[
                  styles.sheetTitle,
                  {
                    color:
                      C.text,
                  },
                ]}
              >
                Password
              </Text>

              <Pressable
                onPress={() =>
                  setOpenSetting(
                    null
                  )
                }
                hitSlop={12}
              >
                <X
                  color={C.muted}
                  size={21}
                />
              </Pressable>
            </View>

            <Text
              style={[
                styles.placeholder,
                {
                  color:
                    C.muted,
                },
              ]}
            >
              Password management will
              be available soon.
            </Text>

            <Pressable
              onPress={() =>
                setOpenSetting(
                  null
                )
              }
              style={[
                styles.saveButton,
                {
                  backgroundColor:
                    accentForeground,
                },
              ]}
            >
              <Text
                style={[
                  styles.saveText,
                  {
                    color:
                      onAccent,
                  },
                ]}
              >
                Done
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* PRIVACY SHEET */}

      <Modal
        visible={
          openSetting ===
          'privacy'
        }
        transparent
        animationType="slide"
        onRequestClose={() =>
          setOpenSetting(null)
        }
      >
        <View
          style={
            styles.modalShade
          }
        >
          <View
            style={[
              styles.sheet,
              {
                backgroundColor:
                  C.card,
              },
            ]}
          >
            <View
              style={
                styles.sheetHeader
              }
            >
              <Text
                style={[
                  styles.sheetTitle,
                  {
                    color:
                      C.text,
                  },
                ]}
              >
                Privacy Policy
              </Text>

              <Pressable
                onPress={() =>
                  setOpenSetting(
                    null
                  )
                }
                hitSlop={12}
              >
                <X
                  color={C.muted}
                  size={21}
                />
              </Pressable>
            </View>

            <Text
              style={[
                styles.placeholder,
                {
                  color:
                    C.muted,
                },
              ]}
            >
              Privacy policy details will
              be available soon.
            </Text>

            <Pressable
              onPress={() =>
                setOpenSetting(
                  null
                )
              }
              style={[
                styles.saveButton,
                {
                  backgroundColor:
                    accentForeground,
                },
              ]}
            >
              <Text
                style={[
                  styles.saveText,
                  {
                    color:
                      onAccent,
                  },
                ]}
              >
                Done
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* RESET SHEET */}

      <Modal
        visible={
          openSetting ===
          'reset'
        }
        transparent
        animationType="slide"
        onRequestClose={() =>
          setOpenSetting(null)
        }
      >
        <View
          style={
            styles.modalShade
          }
        >
          <View
            style={[
              styles.sheet,
              {
                backgroundColor:
                  C.card,
              },
            ]}
          >
            <View
              style={
                styles.sheetHeader
              }
            >
              <Text
                style={[
                  styles.sheetTitle,
                  {
                    color:
                      C.text,
                  },
                ]}
              >
                Reset App
              </Text>

              <Pressable
                onPress={() =>
                  setOpenSetting(
                    null
                  )
                }
                hitSlop={12}
              >
                <X
                  color={C.muted}
                  size={21}
                />
              </Pressable>
            </View>

            <Text
              style={[
                styles.placeholder,
                {
                  color:
                    C.muted,
                },
              ]}
            >
              This will reset all app data to
              defaults. This action cannot be
              undone.
            </Text>

            <Pressable
              onPress={() =>
                setOpenSetting(
                  null
                )
              }
              style={[
                styles.saveButton,
                {
                  backgroundColor:
                    '#C53A2F',
                },
              ]}
            >
              <Text
                style={[
                  styles.saveText,
                  {
                    color:
                      '#FFF',
                  },
                ]}
              >
                Reset
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* TIMEZONE PICKER */}

      <Modal
        visible={
          timezoneOpen
        }
        transparent
        animationType="slide"
        onRequestClose={() => {
          setTimezoneOpen(
            false
          );
          setTimezoneSearch(
            ''
          );
        }}
      >
        <View
          style={
            styles.modalShade
          }
        >
          <View
            style={[
              styles.sheet,
              {
                backgroundColor:
                  C.card,
              },
            ]}
          >
            <View
              style={
                styles.sheetHeader
              }
            >
              <Text
                style={[
                  styles.sheetTitle,
                  {
                    color:
                      C.text,
                  },
                ]}
              >
                Timezone
              </Text>

              <Pressable
                onPress={() => {
                  setTimezoneOpen(
                    false
                  );
                  setTimezoneSearch(
                    ''
                  );
                }}
                hitSlop={12}
              >
                <X
                  color={C.muted}
                  size={21}
                />
              </Pressable>
            </View>

            <Text
              style={[
                styles.timezoneDescription,
                {
                  color:
                    C.muted,
                },
              ]}
            >
              This timezone applies to
              the app. Your planner,
              reminders, calendar,
              habits, and other
              time-based features can
              use this timezone.
            </Text>

            {/* SEARCH */}

            <View
              style={[
                styles.timezoneSearchBox,
                {
                  backgroundColor:
                    C.input,
                  borderColor:
                    C.inputBorder,
                },
              ]}
            >
              <TextInput
                value={
                  timezoneSearch
                }
                onChangeText={
                  setTimezoneSearch
                }
                placeholder="Search city or timezone..."
                placeholderTextColor={
                  C.muted
                }
                style={[
                  styles.timezoneSearchInput,
                  {
                    color:
                      C.text,
                  },
                ]}
                autoCapitalize="none"
                autoCorrect={false}
                clearButtonMode="while-editing"
              />
            </View>

            {/* TIMEZONE LIST */}

            <ScrollView
              style={
                styles.timezoneScroll
              }
              showsVerticalScrollIndicator={
                false
              }
              keyboardShouldPersistTaps="handled"
            >
              {filteredTimezoneGroups.map(
                ({
                  group,
                  items,
                }) => (
                  <View
                    key={group}
                  >
                    <Text
                      style={[
                        styles.timezoneGroupTitle,
                        {
                          color:
                            accentForeground,
                        },
                      ]}
                    >
                      {group.toUpperCase()}
                    </Text>

                    {items.map(
                      (
                        item
                      ) => (
                        <Pressable
                          key={
                            item.value
                          }
                          onPress={async () => {
                            await updateSettings(
                              {
                                timezone:
                                  item.value,
                              }
                            );

                            setTimezoneOpen(
                              false
                            );

                            setTimezoneSearch(
                              ''
                            );
                          }}
                          style={[
                            styles.timezoneRow,
                            {
                              borderBottomColor:
                                C.divider,
                            },
                          ]}
                        >
                          <View
                            style={
                              styles.timezoneCopy
                            }
                          >
                            <Text
                              style={[
                                styles.timezoneLabel,
                                {
                                  color:
                                    C.text,
                                },
                              ]}
                            >
                              {
                                item.label
                              }
                            </Text>

                            <Text
                              style={[
                                styles.timezoneCode,
                                {
                                  color:
                                    C.muted,
                                },
                              ]}
                            >
                              {
                                item.value
                              }
                            </Text>
                          </View>

                          {timezone ===
                            item.value && (
                            <Check
                              color={
                                accentForeground
                              }
                              size={
                                18
                              }
                              strokeWidth={
                                2.5
                              }
                            />
                          )}
                        </Pressable>
                      )
                    )}
                  </View>
                )
              )}

              {filteredTimezoneGroups.length ===
                0 && (
                <View
                  style={
                    styles.noTimezoneResults
                  }
                >
                  <Text
                    style={[
                      styles.noTimezoneText,
                      {
                        color:
                          C.muted,
                      },
                    ]}
                  >
                    No timezones found.
                  </Text>
                </View>
              )}
            </ScrollView>

            <Pressable
              onPress={() => {
                setTimezoneOpen(
                  false
                );

                setTimezoneSearch(
                  ''
                );
              }}
              style={[
                styles.saveButton,
                {
                  backgroundColor:
                    accentForeground,
                },
              ]}
            >
              <Text
                style={[
                  styles.saveText,
                  {
                    color:
                      onAccent,
                  },
                ]}
              >
                Done
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* CURRENCY PICKER */}

      <CurrencyPickerModal
        visible={
          currencyOpen
        }
        currentCode={
          currency_code
        }
        onSelect={(
          code
        ) =>
          updateSettings({
            currency_code:
              code,
          })
        }
        onClose={() =>
          setCurrencyOpen(
            false
          )
        }
        accent={
          accentForeground
        }
        onAccent={
          onAccent
        }
        isDark={
          isDark
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingTop: 28,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },

  headerSpacer: {
    width: 1,
    height: 1,
  },

  headerTitle: {
    fontFamily: FONT_XB,
    fontSize: 16,
    letterSpacing: 1.4,
  },

  content: {
    padding: 22,
    paddingBottom: 40,
  },

  profileCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 22,
  },

  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
    marginBottom: 22,
  },

  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },

  avatarText: {
    fontFamily: FONT_BOLD,
    fontSize: 28,
  },

  camera: {
    position: 'absolute',
    bottom: -2,
    right: -3,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFF',
  },

  profileCopy: {
    flex: 1,
  },

  name: {
    fontFamily: FONT_BOLD,
    fontSize: 22,
  },

  username: {
    fontFamily: FONT_MED,
    fontSize: 12,
    marginTop: 3,
  },

  profileTitleText: {
    fontFamily: FONT_SEMI,
    fontSize: 12,
    marginTop: 5,
  },

  formInline: {
    flex: 1,
    gap: 4,
  },

  bioForm: {
    marginBottom: 22,
  },

  bioLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  titleLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  fieldLabel: {
    fontFamily: FONT_MED,
    fontSize: 11,
    marginBottom: 7,
    marginTop: 10,
  },

  characterCount: {
    fontFamily: FONT,
    fontSize: 10,
    marginTop: 10,
  },

  wordCount: {
    fontFamily: FONT,
    fontSize: 10,
    marginTop: 10,
  },

  input: {
    width: '100%',
    minHeight: 44,
    borderWidth: 1,
    borderRadius: 11,
    paddingHorizontal: 13,
    fontSize: 13,
    fontFamily: FONT,
  },

  bio: {
    height: 84,
    paddingTop: 12,
    textAlignVertical: 'top',
  },

  bioText: {
    fontFamily: FONT,
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 24,
  },

  primaryButton: {
    height: 45,
    borderRadius: 13,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: '100%',
  },

  primaryText: {
    fontFamily: FONT_BOLD,
    fontSize: 13,
  },

  logoutWrap: {
    alignItems: 'center',
    marginTop: 18,
  },

  logout: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    padding: 8,
  },

  logoutText: {
    fontFamily: FONT_SEMI,
    fontSize: 12,
  },

  settingsTitle: {
    fontFamily: FONT_BOLD,
    fontSize: 10,
    letterSpacing: 1.5,
    marginBottom: 9,
    marginTop: 28,
    marginLeft: 4,
  },

  settingsCard: {
    borderRadius: 17,
    borderWidth: 1,
    paddingHorizontal: 14,
  },

  settingRow: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    gap: 12,
  },

  rowIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },

  rowLabel: {
    fontFamily: FONT_SEMI,
    fontSize: 14,
    flex: 1,
  },

  rowValue: {
    fontFamily: FONT,
    fontSize: 12,
  },

  rowCopy: {
    flex: 1,
    gap: 2,
  },

  currencySymbol: {
    fontFamily: FONT_BOLD,
    fontSize: 14,
  },

  timezoneIconText: {
    fontFamily: FONT_BOLD,
    fontSize: 10,
    letterSpacing: 0.3,
  },

  modalShade: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor:
      'rgba(0,0,0,0.45)',
  },

  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 22,
    paddingBottom: 34,
    maxHeight: '90%',
  },

  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },

  sheetTitle: {
    fontFamily: FONT_BOLD,
    fontSize: 18,
    flex: 1,
    marginRight: 12,
  },

  group: {
    fontFamily: FONT_BOLD,
    fontSize: 10,
    letterSpacing: 1.5,
    marginBottom: 9,
    marginTop: 8,
  },

  subCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
  },

  panelTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
  },

  panelTitleText: {
    fontFamily: FONT_BOLD,
    fontSize: 13,
  },

  panelLabel: {
    fontFamily: FONT_BOLD,
    fontSize: 13,
    marginBottom: 16,
  },

  modeToggle: {
    flexDirection: 'row',
    borderRadius: 11,
    padding: 3,
  },

  modeOption: {
    flex: 1,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },

  modeText: {
    fontFamily: FONT_SEMI,
    fontSize: 12,
  },

  palette: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },

  swatchWrap: {
    alignItems: 'center',
    gap: 6,
    width: '20%',
  },

  swatch: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },

  swatchLabel: {
    fontFamily: FONT,
    fontSize: 9,
  },

  placeholder: {
    fontFamily: FONT,
    fontSize: 14,
    lineHeight: 22,
    paddingVertical: 20,
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

  timezoneDescription: {
    fontFamily: FONT,
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 14,
  },

  timezoneSearchBox: {
    height: 46,
    borderWidth: 1,
    borderRadius: 12,
    marginBottom: 8,
    justifyContent: 'center',
  },

  timezoneSearchInput: {
    flex: 1,
    paddingHorizontal: 14,
    fontFamily: FONT,
    fontSize: 13,
  },

  timezoneScroll: {
    maxHeight: 400,
  },

  timezoneGroupTitle: {
    fontFamily: FONT_BOLD,
    fontSize: 10,
    letterSpacing: 1.5,
    marginTop: 14,
    marginBottom: 4,
  },

  timezoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 58,
    paddingVertical: 9,
    borderBottomWidth: 1,
  },

  timezoneCopy: {
    flex: 1,
    paddingRight: 12,
  },

  timezoneLabel: {
    fontFamily: FONT_SEMI,
    fontSize: 13,
  },

  timezoneCode: {
    fontFamily: FONT,
    fontSize: 10,
    marginTop: 2,
  },

  noTimezoneResults: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },

  noTimezoneText: {
    fontFamily: FONT,
    fontSize: 13,
  },
});