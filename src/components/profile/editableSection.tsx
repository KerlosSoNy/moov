import type { Colors } from "@/constants/theme";
import { useTheme } from "@/hooks/useTheme";
import { useTranslation } from "@/i18n/languageProvider";
import type { ReactNode } from "react";
import {
    ActivityIndicator,
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    View,
    type TextInputProps,
} from "react-native";

type SectionProps = {
    title: string;
    editing: boolean;
    saving?: boolean;
    error?: string | null;
    onEdit: () => void;
    onCancel: () => void;
    onSave: () => void;
    children: ReactNode;
};

export function EditableSection({
    title,
    editing,
    saving = false,
    error,
    onEdit,
    onCancel,
    onSave,
    children,
}: SectionProps) {
    const { t } = useTranslation();
    const { colors } = useTheme();
    const styles = createStyles(colors);

    return (
        <View>
            <View style={styles.header}>
                <Text style={styles.title}>{title}</Text>
                {editing ? (
                    <View style={styles.actions}>
                        <Pressable onPress={onCancel} disabled={saving} hitSlop={8}>
                            <Text style={styles.cancel}>{t("cancel")}</Text>
                        </Pressable>
                        <Pressable onPress={onSave} disabled={saving} hitSlop={8}>
                            {saving ? (
                                <ActivityIndicator size="small" color={colors.link} />
                            ) : (
                                <Text style={styles.action}>{t("save")}</Text>
                            )}
                        </Pressable>
                    </View>
                ) : (
                    <Pressable onPress={onEdit} hitSlop={8}>
                        <Text style={styles.action}>{t("edit")}</Text>
                    </Pressable>
                )}
            </View>
            <View style={styles.card}>{children}</View>
            {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>
    );
}

type FieldProps = Omit<TextInputProps, "style"> & {
    label: string;
    editing: boolean;
    first?: boolean;
};

export function EditableField({ label, editing, first, ...input }: FieldProps) {
    const { colors } = useTheme();
    const styles = createStyles(colors);

    return (
        <View style={[styles.field, !first && styles.divider]}>
            <Text style={styles.label}>{label}</Text>
            <TextInput
                {...input}
                editable={editing}
                placeholderTextColor={colors.textFaint}
                style={[styles.input, !editing && styles.inputReadOnly]}
            />
        </View>
    );
}

const createStyles = (c: Colors) => StyleSheet.create({
    header: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        marginHorizontal: 20,
        marginBottom: 8,
        marginTop: 16,
    },
    title: {
        color: c.textMuted,
        fontSize: 13,
        fontWeight: "600",
        textTransform: "uppercase",
    },
    actions: {
        flexDirection: "row",
        alignItems: "center",
        gap: 18,
    },
    action: {
        color: c.link,
        fontSize: 15,
        fontWeight: "600",
    },
    cancel: {
        color: c.textMuted,
        fontSize: 15,
        fontWeight: "500",
    },
    card: {
        marginHorizontal: 16,
        borderRadius: 16,
        backgroundColor: c.surface,
        overflow: "hidden",
    },
    field: {
        paddingHorizontal: 14,
        paddingVertical: 10,
    },
    divider: {
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: c.border,
    },
    label: {
        color: c.textMuted,
        fontSize: 12,
        fontWeight: "500",
        marginBottom: 4,
    },
    input: {
        color: c.text,
        fontSize: 17,
        paddingVertical: 4,
        textAlign: "auto",
    },
    inputReadOnly: {
        color: c.textSecondary,
    },
    error: {
        color: c.danger,
        fontSize: 13,
        marginHorizontal: 20,
        marginTop: 8,
    },
});
