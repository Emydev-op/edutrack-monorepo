-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "citext";

-- CreateEnum
CREATE TYPE "session_status" AS ENUM ('UPCOMING', 'ACTIVE', 'CLOSING', 'CLOSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "session_structure" AS ENUM ('THREE_TERMS', 'TWO_SEMESTERS', 'CUSTOM');

-- CreateEnum
CREATE TYPE "term_status" AS ENUM ('UPCOMING', 'ACTIVE', 'ENDED', 'CLOSED');

-- CreateEnum
CREATE TYPE "term_event_type" AS ENUM ('RESUMPTION', 'MIDTERM', 'CA', 'EXAMS', 'PTA', 'RESULTS', 'CUSTOM');

-- CreateEnum
CREATE TYPE "calendar_event_type" AS ENUM ('TERM', 'BREAK', 'EXAM', 'HOLIDAY', 'MEETING', 'EVENT');

-- CreateEnum
CREATE TYPE "subject_category" AS ENUM ('CORE', 'SCIENCE', 'ARTS', 'COMMERCIAL', 'TECHNICAL', 'LANGUAGE', 'RELIGIOUS', 'EARLY_YEARS');

-- CreateEnum
CREATE TYPE "subject_status" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "offering" AS ENUM ('COMPULSORY', 'ELECTIVE');

-- CreateEnum
CREATE TYPE "teaching_assignment_type" AS ENUM ('SUBJECT_TEACHER', 'TEMPORARY', 'PART_TIME');

-- CreateEnum
CREATE TYPE "weekday" AS ENUM ('MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY');

-- CreateEnum
CREATE TYPE "timetable_status" AS ENUM ('DRAFT', 'REVIEWED', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "timetable_layer" AS ENUM ('DRAFT', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "assessment_mode" AS ENUM ('SCORES', 'DESCRIPTIVE');

-- CreateEnum
CREATE TYPE "attendance_mark" AS ENUM ('PRESENT', 'LATE', 'ABSENT', 'EXCUSED');

-- CreateEnum
CREATE TYPE "actor_kind" AS ENUM ('USER', 'PLATFORM_STAFF', 'SYSTEM');

-- CreateEnum
CREATE TYPE "channel" AS ENUM ('IN_APP', 'EMAIL', 'SMS');

-- CreateEnum
CREATE TYPE "delivery_status" AS ENUM ('QUEUED', 'SENT', 'DELIVERED', 'READ', 'FAILED');

-- CreateEnum
CREATE TYPE "comms_event" AS ENUM ('ADMISSION', 'PARENT_INVITATION', 'STAFF_INVITATION', 'INVOICE_ISSUED', 'FEE_REMINDER', 'FEE_OVERDUE', 'INSTALLMENT_DUE', 'PAYMENT_DETAILS', 'PAYMENT_CONFIRMED', 'PAYMENT_REJECTED', 'REFUND_PAID', 'ASSIGNMENT_PUBLISHED', 'RESULT_PUBLISHED', 'STUDENT_EXIT', 'GRADUATION', 'TIMETABLE_PUBLISHED', 'ATTENDANCE_ABSENT', 'ANNOUNCEMENT');

-- CreateEnum
CREATE TYPE "recipient_role" AS ENUM ('PARENT', 'STUDENT', 'TEACHER', 'STAFF');

-- CreateEnum
CREATE TYPE "announcement_status" AS ENUM ('DRAFT', 'SCHEDULED', 'SENT', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "audience_kind" AS ENUM ('EVERYONE', 'PARENTS', 'STUDENTS', 'TEACHERS', 'STAFF', 'CLASSES');

-- CreateEnum
CREATE TYPE "sender_id_status" AS ENUM ('NOT_REQUESTED', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "sms_credit_kind" AS ENUM ('PLAN_ALLOWANCE', 'PURCHASE', 'USAGE', 'REFUND', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "file_scan_status" AS ENUM ('PENDING', 'CLEAN', 'INFECTED', 'FAILED');

-- CreateEnum
CREATE TYPE "fee_category" AS ENUM ('TUITION', 'LEVY', 'EXAMS', 'ICT', 'BOOKS', 'UNIFORM', 'TRANSPORT', 'FEEDING', 'BOARDING', 'ACTIVITIES', 'ADMISSION', 'OTHER');

-- CreateEnum
CREATE TYPE "invoice_line_category" AS ENUM ('TUITION', 'LEVY', 'EXAMS', 'ICT', 'BOOKS', 'UNIFORM', 'TRANSPORT', 'FEEDING', 'BOARDING', 'ACTIVITIES', 'ADMISSION', 'OTHER', 'ADJUSTMENT', 'LATE_FEE');

-- CreateEnum
CREATE TYPE "fee_charged" AS ENUM ('EVERY_TERM', 'ONCE_A_SESSION', 'NEW_STUDENTS_ONLY');

-- CreateEnum
CREATE TYPE "fee_type" AS ENUM ('COMPULSORY', 'OPTIONAL');

-- CreateEnum
CREATE TYPE "active_status" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "fee_item_status" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "fee_structure_status" AS ENUM ('DRAFT', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "discount_basis" AS ENUM ('SIBLING', 'STAFF_CHILD', 'SCHOLARSHIP', 'CUSTOM');

-- CreateEnum
CREATE TYPE "discount_kind" AS ENUM ('PERCENTAGE', 'FIXED_AMOUNT');

-- CreateEnum
CREATE TYPE "discount_applies_to" AS ENUM ('TUITION_ONLY', 'ALL_COMPULSORY');

-- CreateEnum
CREATE TYPE "invoice_status" AS ENUM ('DRAFT', 'ISSUED', 'PARTIALLY_PAID', 'PAID', 'CANCELLED');

-- CreateEnum
CREATE TYPE "payment_method" AS ENUM ('BANK_TRANSFER', 'POS', 'CASH', 'CHEQUE', 'OTHER');

-- CreateEnum
CREATE TYPE "payment_status" AS ENUM ('PENDING_VERIFICATION', 'CONFIRMED', 'REJECTED');

-- CreateEnum
CREATE TYPE "payment_source" AS ENUM ('SCHOOL', 'PARENT_CLAIM', 'STATEMENT');

-- CreateEnum
CREATE TYPE "refund_status" AS ENUM ('AWAITING_APPROVAL', 'APPROVED', 'PAID', 'REJECTED');

-- CreateEnum
CREATE TYPE "approver_level" AS ENUM ('PRINCIPAL', 'PROPRIETOR');

-- CreateEnum
CREATE TYPE "bank_account_kind" AS ENUM ('BANK', 'CASH');

-- CreateEnum
CREATE TYPE "statement_match" AS ENUM ('MATCHED', 'POSSIBLE_MATCH', 'ALREADY_RECORDED', 'NO_MATCH', 'IGNORED', 'CONFIRMED');

-- CreateEnum
CREATE TYPE "expense_status" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'PAID', 'REJECTED');

-- CreateEnum
CREATE TYPE "expense_approval_role" AS ENUM ('BURSAR', 'PRINCIPAL');

-- CreateEnum
CREATE TYPE "late_fee_kind" AS ENUM ('NONE', 'FIXED_AMOUNT', 'PERCENTAGE');

-- CreateEnum
CREATE TYPE "transfer_reference" AS ENUM ('ADMISSION_NUMBER', 'INVOICE_NUMBER');

-- CreateEnum
CREATE TYPE "user_status" AS ENUM ('ACTIVE', 'SUSPENDED', 'DEACTIVATED');

-- CreateEnum
CREATE TYPE "portal" AS ENUM ('PLATFORM', 'SCHOOL_ADMIN', 'TEACHER', 'PARENT', 'STUDENT');

-- CreateEnum
CREATE TYPE "membership_kind" AS ENUM ('STAFF', 'GUARDIAN', 'STUDENT');

-- CreateEnum
CREATE TYPE "membership_status" AS ENUM ('INVITED', 'ACTIVE', 'SUSPENDED', 'DEACTIVATED', 'REVOKED');

-- CreateEnum
CREATE TYPE "invitation_status" AS ENUM ('PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED');

-- CreateEnum
CREATE TYPE "invitation_kind" AS ENUM ('PLATFORM_STAFF', 'SCHOOL_STAFF', 'GUARDIAN', 'STUDENT');

-- CreateEnum
CREATE TYPE "access_scope" AS ENUM ('SCHOOL', 'BRANCH');

-- CreateEnum
CREATE TYPE "role_type" AS ENUM ('PREDEFINED', 'CUSTOM');

-- CreateEnum
CREATE TYPE "role_scope" AS ENUM ('SCHOOL', 'BRANCH', 'SECTION', 'DEPARTMENT', 'ASSIGNED_CLASSES', 'STORE');

-- CreateEnum
CREATE TYPE "gender" AS ENUM ('FEMALE', 'MALE');

-- CreateEnum
CREATE TYPE "staff_kind" AS ENUM ('TEACHING', 'NON_TEACHING');

-- CreateEnum
CREATE TYPE "staff_group" AS ENUM ('TEACHING', 'ADMINISTRATIVE', 'FINANCE', 'OPERATIONS');

-- CreateEnum
CREATE TYPE "employment" AS ENUM ('FULL_TIME', 'PART_TIME', 'CONTRACT');

-- CreateEnum
CREATE TYPE "staff_status" AS ENUM ('ACTIVE', 'DEACTIVATED');

-- CreateEnum
CREATE TYPE "document_status" AS ENUM ('VERIFIED', 'PENDING', 'MISSING', 'OPTIONAL');

-- CreateEnum
CREATE TYPE "student_status" AS ENUM ('ACTIVE', 'INCOMPLETE_PROFILE', 'TRANSFERRED', 'WITHDRAWN', 'GRADUATED');

-- CreateEnum
CREATE TYPE "admission_type" AS ENUM ('NEW_INTAKE', 'TRANSFER_IN');

-- CreateEnum
CREATE TYPE "student_exit_kind" AS ENUM ('TRANSFER', 'WITHDRAWAL');

-- CreateEnum
CREATE TYPE "application_stage" AS ENUM ('PENDING', 'UNDER_REVIEW', 'OFFER_ACCEPTED', 'ADMITTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "enrollment_status" AS ENUM ('ACTIVE', 'COMPLETED', 'LEFT');

-- CreateEnum
CREATE TYPE "promotion_outcome" AS ENUM ('PROMOTE', 'REPEAT', 'GRADUATE', 'TRANSFER', 'WITHDRAW');

-- CreateEnum
CREATE TYPE "platform_staff_status" AS ENUM ('INVITED', 'ACTIVE', 'SUSPENDED', 'DEACTIVATED');

-- CreateEnum
CREATE TYPE "plan_status" AS ENUM ('ACTIVE', 'DRAFT', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "pricing_model" AS ENUM ('FLAT', 'PER_STUDENT', 'CUSTOM');

-- CreateEnum
CREATE TYPE "billing_period" AS ENUM ('ANNUAL', 'TERM', 'MONTH');

-- CreateEnum
CREATE TYPE "support_tier" AS ENUM ('STANDARD', 'PRIORITY');

-- CreateEnum
CREATE TYPE "subscription_status" AS ENUM ('ACTIVE', 'EXPIRING', 'GRACE_PERIOD', 'RESTRICTED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "platform_invoice_kind" AS ENUM ('NEW_SCHOOL', 'RENEWAL', 'UPGRADE', 'SETUP_FEE', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "platform_invoice_status" AS ENUM ('ISSUED', 'PAID', 'VOID');

-- CreateEnum
CREATE TYPE "support_session_mode" AS ENUM ('READ_ONLY');

-- CreateEnum
CREATE TYPE "sheet_status" AS ENUM ('NOT_STARTED', 'DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'RETURNED', 'APPROVED', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "reviewer_kind" AS ENUM ('HOD', 'OFFICE');

-- CreateEnum
CREATE TYPE "sheet_action" AS ENUM ('SAVED', 'SUBMITTED', 'FORWARDED', 'RETURNED', 'APPROVED', 'PUBLISHED', 'REOPENED', 'CORRECTION_APPLIED');

-- CreateEnum
CREATE TYPE "score_state" AS ENUM ('SCORED', 'ABSENT', 'EXEMPT');

-- CreateEnum
CREATE TYPE "correction_status" AS ENUM ('UNDER_REVIEW', 'APPLIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "conduct_trait" AS ENUM ('PUNCTUALITY', 'NEATNESS', 'ATTENTIVENESS', 'RELATIONSHIP_WITH_OTHERS', 'LEADERSHIP');

-- CreateEnum
CREATE TYPE "school_status" AS ENUM ('ONBOARDING', 'ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "school_ownership" AS ENUM ('PRIVATE', 'PUBLIC', 'MISSION');

-- CreateEnum
CREATE TYPE "branch_status" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "number_kind" AS ENUM ('ADMISSION', 'STAFF', 'INVOICE', 'RECEIPT', 'REFUND', 'EXPENSE', 'TRANSFER', 'TICKET', 'APPLICATION');

-- CreateEnum
CREATE TYPE "import_kind" AS ENUM ('STUDENTS', 'STAFF');

-- CreateEnum
CREATE TYPE "import_status" AS ENUM ('VALIDATED', 'COMMITTED', 'DISCARDED');

-- CreateEnum
CREATE TYPE "score_rounding" AS ENUM ('WHOLE_NUMBER', 'ONE_DECIMAL');

-- CreateEnum
CREATE TYPE "ticket_topic" AS ENUM ('RESULTS_AND_REPORT_CARDS', 'FEES_AND_PAYMENTS', 'COMMUNICATION', 'STUDENTS_AND_ADMISSIONS', 'ACCOUNT_AND_BILLING', 'SOMETHING_ELSE');

-- CreateEnum
CREATE TYPE "ticket_category" AS ENUM ('ACCOUNT', 'BILLING', 'SUBSCRIPTION', 'TECHNICAL', 'ACADEMIC', 'FINANCE', 'ACCESS', 'OTHER');

-- CreateEnum
CREATE TYPE "ticket_priority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "ticket_status" AS ENUM ('OPEN', 'ASSIGNED', 'IN_PROGRESS', 'WAITING_FOR_SCHOOL', 'ON_HOLD', 'ESCALATED', 'RESOLVED', 'CLOSED', 'REOPENED');

-- CreateEnum
CREATE TYPE "support_team" AS ENUM ('TIER_1_SUPPORT', 'TECHNICAL', 'BILLING', 'ONBOARDING', 'ENGINEERING');

-- CreateEnum
CREATE TYPE "ticket_message_kind" AS ENUM ('SCHOOL', 'AGENT', 'NOTE');

-- CreateEnum
CREATE TYPE "tone" AS ENUM ('SUCCESS', 'INFO', 'WARNING', 'ERROR', 'NEUTRAL');

-- CreateEnum
CREATE TYPE "assignment_status" AS ENUM ('DRAFT', 'PUBLISHED', 'CLOSED');

-- CreateEnum
CREATE TYPE "submission_status" AS ENUM ('NOT_SUBMITTED', 'SUBMITTED', 'LATE', 'GRADED', 'RETURNED', 'EXCUSED');

-- CreateEnum
CREATE TYPE "material_type" AS ENUM ('PDF', 'DOCUMENT', 'PRESENTATION', 'IMAGE', 'VIDEO_LINK');

-- CreateEnum
CREATE TYPE "material_status" AS ENUM ('PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "lesson_note_status" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'RETURNED');

-- CreateTable
CREATE TABLE "sections" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "academic_sessions" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "starts_on" DATE NOT NULL,
    "ends_on" DATE NOT NULL,
    "status" "session_status" NOT NULL DEFAULT 'UPCOMING',
    "structure" "session_structure" NOT NULL DEFAULT 'THREE_TERMS',
    "note" TEXT,
    "copied_from_id" UUID,
    "closed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "academic_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "terms" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "starts_on" DATE NOT NULL,
    "ends_on" DATE NOT NULL,
    "status" "term_status" NOT NULL DEFAULT 'UPCOMING',
    "result_entry_closes_at" TIMESTAMPTZ(3),
    "fees_due_on" DATE,
    "closed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "terms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "term_events" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "term_id" UUID NOT NULL,
    "type" "term_event_type" NOT NULL,
    "name" TEXT NOT NULL,
    "starts_on" DATE NOT NULL,
    "ends_on" DATE NOT NULL,
    "closes_school" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "term_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calendar_events" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "type" "calendar_event_type" NOT NULL,
    "starts_on" DATE NOT NULL,
    "ends_on" DATE NOT NULL,
    "audience" TEXT NOT NULL DEFAULT 'Everyone',
    "notes" TEXT NOT NULL DEFAULT '',
    "closes_school" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "calendar_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "class_levels" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "section_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "next_level_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "class_levels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "class_arms" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "level_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL DEFAULT 35,
    "room" TEXT,
    "archived_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "class_arms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "class_teacher_assignments" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "arm_id" UUID NOT NULL,
    "staff_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "class_teacher_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subjects" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "subject_category" NOT NULL,
    "status" "subject_status" NOT NULL DEFAULT 'ACTIVE',
    "periods_per_week" INTEGER NOT NULL DEFAULT 4,
    "department_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subjects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "curriculum_entries" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "level_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "offering" "offering" NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "curriculum_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "elective_groups" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "section_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "min_picks" INTEGER NOT NULL DEFAULT 1,
    "max_picks" INTEGER NOT NULL DEFAULT 1,
    "note" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "elective_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "elective_group_subjects" (
    "school_id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "elective_group_subjects_pkey" PRIMARY KEY ("group_id","subject_id")
);

-- CreateTable
CREATE TABLE "student_subjects" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "group_id" UUID,
    "started_on" DATE,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_subjects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teaching_assignments" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "term_id" UUID NOT NULL,
    "arm_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "staff_id" UUID NOT NULL,
    "type" "teaching_assignment_type" NOT NULL DEFAULT 'SUBJECT_TEACHER',
    "periods_per_week" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "teaching_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "timetable_periods" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "starts_at" TIME(0) NOT NULL,
    "ends_at" TIME(0) NOT NULL,
    "is_break" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "timetable_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "timetables" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "term_id" UUID NOT NULL,
    "arm_id" UUID NOT NULL,
    "status" "timetable_status" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "published_version" INTEGER,
    "published_at" TIMESTAMPTZ(3),
    "max_consecutive" INTEGER NOT NULL DEFAULT 2,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "timetables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "timetable_slots" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "timetable_id" UUID NOT NULL,
    "term_id" UUID NOT NULL,
    "layer" "timetable_layer" NOT NULL,
    "day" "weekday" NOT NULL,
    "period_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "staff_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "timetable_slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessment_schemes" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "section_id" UUID NOT NULL,
    "mode" "assessment_mode" NOT NULL DEFAULT 'SCORES',
    "scale_name" TEXT NOT NULL DEFAULT '',
    "pass_mark" DECIMAL(5,2) NOT NULL DEFAULT 40,
    "rounding" "score_rounding" NOT NULL DEFAULT 'WHOLE_NUMBER',
    "locked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assessment_schemes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessment_components" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "scheme_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "max_score" DECIMAL(5,2) NOT NULL,
    "weight" DECIMAL(5,2) NOT NULL,
    "typical_when" TEXT NOT NULL DEFAULT '',
    "sort_order" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assessment_components_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grade_bands" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "scheme_id" UUID NOT NULL,
    "grade" TEXT NOT NULL,
    "min_score" DECIMAL(5,2) NOT NULL,
    "max_score" DECIMAL(5,2) NOT NULL,
    "remark" TEXT NOT NULL,
    "points" DECIMAL(4,2) NOT NULL DEFAULT 0,
    "is_pass" BOOLEAN NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "grade_bands_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "descriptive_ratings" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "scheme_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "sort_order" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "descriptive_ratings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_registers" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "term_id" UUID NOT NULL,
    "arm_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "taken_by_id" UUID NOT NULL,
    "taken_at" TIMESTAMPTZ(3) NOT NULL,
    "others_present" INTEGER NOT NULL DEFAULT 0,
    "others_late" INTEGER NOT NULL DEFAULT 0,
    "others_absent" INTEGER NOT NULL DEFAULT 0,
    "others_excused" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_registers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_entries" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "register_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "term_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "mark" "attendance_mark" NOT NULL,
    "reason" TEXT,
    "guardian_notified_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_events" (
    "id" UUID NOT NULL,
    "school_id" UUID,
    "actor_kind" "actor_kind" NOT NULL DEFAULT 'USER',
    "actor_user_id" UUID,
    "actor_name" TEXT,
    "action" TEXT NOT NULL,
    "area" TEXT,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT,
    "summary" TEXT NOT NULL,
    "detail" TEXT,
    "before" JSONB,
    "after" JSONB,
    "ip" INET,
    "user_agent" TEXT,
    "request_id" TEXT,
    "support_session_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "communication_settings" (
    "school_id" UUID NOT NULL,
    "quiet_hours_enabled" BOOLEAN NOT NULL DEFAULT true,
    "quiet_hours_start" TIME(0) NOT NULL DEFAULT '21:00:00'::time,
    "quiet_hours_end" TIME(0) NOT NULL DEFAULT '07:00:00'::time,
    "sender_id" TEXT,
    "sender_id_status" "sender_id_status" NOT NULL DEFAULT 'NOT_REQUESTED',
    "sms_balance_units" INTEGER NOT NULL DEFAULT 0,
    "low_credit_notified_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "communication_settings_pkey" PRIMARY KEY ("school_id")
);

-- CreateTable
CREATE TABLE "sender_id_requests" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "name" VARCHAR(11) NOT NULL,
    "status" "sender_id_status" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "requested_by_id" UUID,
    "decided_at" TIMESTAMPTZ(3),
    "note" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sender_id_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sms_credit_transactions" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "kind" "sms_credit_kind" NOT NULL,
    "units" INTEGER NOT NULL,
    "message_id" UUID,
    "term_id" UUID,
    "amount_kobo" BIGINT,
    "reference" TEXT,
    "note" TEXT NOT NULL DEFAULT '',
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sms_credit_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comms_event_settings" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "event" "comms_event" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "channels" "channel"[],
    "updated_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comms_event_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_templates" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "event" "comms_event" NOT NULL,
    "channel" "channel" NOT NULL,
    "subject" TEXT NOT NULL DEFAULT '',
    "body" TEXT NOT NULL,
    "updated_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "announcements" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "sms_text" TEXT NOT NULL DEFAULT '',
    "audience_kind" "audience_kind" NOT NULL,
    "audience_branch_id" UUID,
    "channels" "channel"[],
    "status" "announcement_status" NOT NULL DEFAULT 'DRAFT',
    "scheduled_for" TIMESTAMPTZ(3),
    "expires_on" DATE,
    "created_by_id" UUID,
    "sent_at" TIMESTAMPTZ(3),
    "withdrawn_at" TIMESTAMPTZ(3),
    "withdraw_reason" TEXT,
    "recipient_count" INTEGER,
    "sms_units" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "announcements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "announcement_arms" (
    "school_id" UUID NOT NULL,
    "announcement_id" UUID NOT NULL,
    "arm_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "announcement_arms_pkey" PRIMARY KEY ("announcement_id","arm_id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "event" "comms_event" NOT NULL,
    "title" TEXT NOT NULL,
    "audience_label" TEXT NOT NULL,
    "sender" TEXT NOT NULL,
    "channels" "channel"[],
    "content" JSONB NOT NULL,
    "source_type" TEXT,
    "source_id" UUID,
    "announcement_id" UUID,
    "created_by_id" UUID,
    "recipient_count" INTEGER NOT NULL DEFAULT 0,
    "sms_units" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_recipients" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "message_id" UUID NOT NULL,
    "role" "recipient_role" NOT NULL,
    "name" TEXT NOT NULL,
    "user_id" UUID,
    "guardian_id" UUID,
    "student_id" UUID,
    "staff_id" UUID,
    "email" TEXT,
    "phone" TEXT,
    "variables" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_deliveries" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "message_id" UUID NOT NULL,
    "recipient_id" UUID NOT NULL,
    "channel" "channel" NOT NULL,
    "address" TEXT NOT NULL DEFAULT '',
    "status" "delivery_status" NOT NULL DEFAULT 'QUEUED',
    "detail" TEXT NOT NULL DEFAULT '',
    "retryable" BOOLEAN NOT NULL DEFAULT false,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "sms_units" INTEGER NOT NULL DEFAULT 0,
    "provider_message_id" TEXT,
    "release_at" TIMESTAMPTZ(3),
    "waiting_for_credit" BOOLEAN NOT NULL DEFAULT false,
    "sent_at" TIMESTAMPTZ(3),
    "delivered_at" TIMESTAMPTZ(3),
    "read_at" TIMESTAMPTZ(3),
    "failed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "school_id" UUID,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "link" TEXT,
    "entity_type" TEXT,
    "entity_id" UUID,
    "delivery_id" UUID,
    "read_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_preferences" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "school_id" UUID,
    "event" TEXT NOT NULL,
    "in_app" BOOLEAN NOT NULL DEFAULT true,
    "email" BOOLEAN NOT NULL DEFAULT true,
    "sms" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stored_files" (
    "id" UUID NOT NULL,
    "school_id" UUID,
    "storage_key" TEXT NOT NULL,
    "original_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "sha256" CHAR(64) NOT NULL,
    "uploaded_by_id" UUID,
    "scan_status" "file_scan_status" NOT NULL DEFAULT 'PENDING',
    "scanned_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "stored_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance_settings" (
    "school_id" UUID NOT NULL,
    "allow_partial" BOOLEAN NOT NULL DEFAULT true,
    "auto_sibling" BOOLEAN NOT NULL DEFAULT true,
    "verify_transfers" BOOLEAN NOT NULL DEFAULT true,
    "late_fee_kind" "late_fee_kind" NOT NULL DEFAULT 'NONE',
    "late_fee_value" BIGINT NOT NULL DEFAULT 0,
    "enabled_methods" "payment_method"[],
    "invoice_prefix" TEXT NOT NULL DEFAULT 'INV',
    "receipt_prefix" TEXT NOT NULL DEFAULT 'RCT',
    "transfer_reference" "transfer_reference" NOT NULL DEFAULT 'ADMISSION_NUMBER',
    "expense_limit_kobo" BIGINT NOT NULL DEFAULT 0,
    "refund_limit_kobo" BIGINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "finance_settings_pkey" PRIMARY KEY ("school_id")
);

-- CreateTable
CREATE TABLE "fee_items" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "category" "fee_category" NOT NULL,
    "charged" "fee_charged" NOT NULL,
    "type" "fee_type" NOT NULL,
    "status" "fee_item_status" NOT NULL DEFAULT 'ACTIVE',
    "description" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fee_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fee_structures" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "term_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "status" "fee_structure_status" NOT NULL DEFAULT 'DRAFT',
    "published_at" TIMESTAMPTZ(3),
    "published_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fee_structures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fee_structure_amounts" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "structure_id" UUID NOT NULL,
    "level_id" UUID NOT NULL,
    "fee_item_id" UUID NOT NULL,
    "amount_kobo" BIGINT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fee_structure_amounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "discounts" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "basis" "discount_basis" NOT NULL,
    "kind" "discount_kind" NOT NULL,
    "value" BIGINT NOT NULL,
    "applies_to" "discount_applies_to" NOT NULL DEFAULT 'TUITION_ONLY',
    "from_child" SMALLINT,
    "needs_approval" BOOLEAN NOT NULL DEFAULT false,
    "is_automatic" BOOLEAN NOT NULL DEFAULT false,
    "status" "active_status" NOT NULL DEFAULT 'ACTIVE',
    "description" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "discounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_plans" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "status" "active_status" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_plan_installments" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "sequence" SMALLINT NOT NULL,
    "share_bp" INTEGER NOT NULL,
    "offset_days" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_plan_installments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "student_id" UUID NOT NULL,
    "term_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "level_id" UUID NOT NULL,
    "arm_id" UUID,
    "status" "invoice_status" NOT NULL DEFAULT 'DRAFT',
    "subtotal_kobo" BIGINT NOT NULL DEFAULT 0,
    "discount_kobo" BIGINT NOT NULL DEFAULT 0,
    "total_kobo" BIGINT NOT NULL DEFAULT 0,
    "paid_kobo" BIGINT NOT NULL DEFAULT 0,
    "issued_on" DATE,
    "due_on" DATE NOT NULL,
    "payment_plan_id" UUID,
    "notified_at" TIMESTAMPTZ(3),
    "cancelled_at" TIMESTAMPTZ(3),
    "cancelled_by_id" UUID,
    "cancel_reason" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_lines" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "fee_item_id" UUID,
    "label" TEXT NOT NULL,
    "category" "invoice_line_category" NOT NULL,
    "amount_kobo" BIGINT NOT NULL,
    "is_optional" BOOLEAN NOT NULL DEFAULT false,
    "added_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoice_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_discounts" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "discount_id" UUID,
    "label" TEXT NOT NULL,
    "amount_kobo" BIGINT NOT NULL,
    "applied_by_id" UUID,
    "approved_by_id" UUID,
    "approved_at" TIMESTAMPTZ(3),
    "reason" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoice_discounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_installments" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "sequence" SMALLINT NOT NULL,
    "label" TEXT NOT NULL,
    "amount_kobo" BIGINT NOT NULL,
    "due_on" DATE NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoice_installments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_accounts" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "bank_account_kind" NOT NULL,
    "bank_name" TEXT,
    "account_number" TEXT,
    "account_name" TEXT,
    "branch_id" UUID,
    "show_to_parents" BOOLEAN NOT NULL DEFAULT false,
    "status" "active_status" NOT NULL DEFAULT 'ACTIVE',
    "opening_balance_kobo" BIGINT NOT NULL DEFAULT 0,
    "opening_on" DATE NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bank_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "student_id" UUID NOT NULL,
    "paid_on" DATE NOT NULL,
    "payer_name" TEXT NOT NULL,
    "method" "payment_method" NOT NULL,
    "reference" TEXT NOT NULL DEFAULT '',
    "bank_account_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "amount_kobo" BIGINT NOT NULL,
    "status" "payment_status" NOT NULL,
    "source" "payment_source" NOT NULL,
    "recorded_by_id" UUID,
    "claimed_by_guardian_id" UUID,
    "verified_by_id" UUID,
    "verified_at" TIMESTAMPTZ(3),
    "reject_reason" TEXT,
    "note" TEXT NOT NULL DEFAULT '',
    "proof_file_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_allocations" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "amount_kobo" BIGINT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_applications" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "amount_kobo" BIGINT NOT NULL,
    "applied_on" DATE NOT NULL,
    "applied_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credit_applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refunds" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "student_id" UUID NOT NULL,
    "payment_id" UUID,
    "amount_kobo" BIGINT NOT NULL,
    "reason" TEXT NOT NULL,
    "pay_to" TEXT NOT NULL,
    "status" "refund_status" NOT NULL DEFAULT 'AWAITING_APPROVAL',
    "approver_level" "approver_level" NOT NULL,
    "requested_by_id" UUID,
    "requested_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approved_by_id" UUID,
    "approved_at" TIMESTAMPTZ(3),
    "paid_at" TIMESTAMPTZ(3),
    "paid_from_account_id" UUID,
    "paid_reference" TEXT,
    "reject_reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refunds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account_transfers" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "transferred_on" DATE NOT NULL,
    "from_account_id" UUID NOT NULL,
    "to_account_id" UUID NOT NULL,
    "amount_kobo" BIGINT NOT NULL,
    "reference" TEXT NOT NULL DEFAULT '',
    "note" TEXT NOT NULL DEFAULT '',
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "account_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_statements" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "bank_account_id" UUID NOT NULL,
    "file_id" UUID,
    "file_name" TEXT NOT NULL,
    "uploaded_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bank_statements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_statement_lines" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "statement_id" UUID NOT NULL,
    "line_no" INTEGER NOT NULL,
    "posted_on" DATE NOT NULL,
    "description" TEXT NOT NULL,
    "reference" TEXT NOT NULL DEFAULT '',
    "credit_kobo" BIGINT NOT NULL DEFAULT 0,
    "debit_kobo" BIGINT NOT NULL DEFAULT 0,
    "match" "statement_match" NOT NULL DEFAULT 'NO_MATCH',
    "payment_id" UUID,
    "note" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bank_statement_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendors" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT '',
    "contact_name" TEXT,
    "phone" TEXT,
    "email" CITEXT,
    "address" TEXT,
    "bank_name" TEXT,
    "account_number" TEXT,
    "account_name" TEXT,
    "notes" TEXT NOT NULL DEFAULT '',
    "status" "active_status" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vendors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expense_categories" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "archived_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "expense_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expenses" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "spent_on" DATE NOT NULL,
    "category_id" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "vendor_id" UUID,
    "branch_id" UUID NOT NULL,
    "amount_kobo" BIGINT NOT NULL,
    "method" "payment_method" NOT NULL,
    "status" "expense_status" NOT NULL DEFAULT 'DRAFT',
    "submitted_by_id" UUID,
    "submitted_at" TIMESTAMPTZ(3),
    "paid_from_account_id" UUID,
    "paid_at" TIMESTAMPTZ(3),
    "paid_reference" TEXT,
    "reject_reason" TEXT,
    "notes" TEXT NOT NULL DEFAULT '',
    "attachment_file_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expense_approvals" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "expense_id" UUID NOT NULL,
    "role" "expense_approval_role" NOT NULL,
    "approved_by_id" UUID NOT NULL,
    "approved_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "expense_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" CITEXT NOT NULL,
    "email_verified_at" TIMESTAMPTZ(3),
    "phone" TEXT,
    "title" TEXT,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "avatar_file_id" UUID,
    "status" "user_status" NOT NULL DEFAULT 'ACTIVE',
    "password_hash" TEXT,
    "password_changed_at" TIMESTAMPTZ(3),
    "must_change_password" BOOLEAN NOT NULL DEFAULT false,
    "failed_sign_in_count" INTEGER NOT NULL DEFAULT 0,
    "last_failed_sign_in_at" TIMESTAMPTZ(3),
    "locked_until" TIMESTAMPTZ(3),
    "last_sign_in_at" TIMESTAMPTZ(3),
    "last_seen_at" TIMESTAMPTZ(3),
    "totp_secret_encrypted" TEXT,
    "totp_enabled_at" TIMESTAMPTZ(3),
    "totp_recovery_code_hashes" TEXT[],
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "portal" "portal" NOT NULL,
    "school_id" UUID,
    "refresh_token_hash" TEXT NOT NULL,
    "previous_refresh_token_hash" TEXT,
    "device_label" TEXT,
    "user_agent" TEXT,
    "ip" INET,
    "location" TEXT,
    "remember_me" BOOLEAN NOT NULL DEFAULT false,
    "last_seen_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "revoked_reason" TEXT,
    "support_session_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "used_at" TIMESTAMPTZ(3),
    "requested_ip" INET,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invitations" (
    "id" UUID NOT NULL,
    "kind" "invitation_kind" NOT NULL,
    "status" "invitation_status" NOT NULL DEFAULT 'PENDING',
    "token_hash" TEXT NOT NULL,
    "email" CITEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "school_id" UUID,
    "membership_id" UUID,
    "platform_staff_id" UUID,
    "position" TEXT,
    "invited_by_id" UUID,
    "send_count" INTEGER NOT NULL DEFAULT 1,
    "last_sent_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "accepted_at" TIMESTAMPTZ(3),
    "revoked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "school_memberships" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "kind" "membership_kind" NOT NULL,
    "status" "membership_status" NOT NULL DEFAULT 'INVITED',
    "scope" "access_scope" NOT NULL DEFAULT 'SCHOOL',
    "staff_id" UUID,
    "guardian_id" UUID,
    "student_id" UUID,
    "invited_at" TIMESTAMPTZ(3),
    "activated_at" TIMESTAMPTZ(3),
    "last_active_at" TIMESTAMPTZ(3),
    "status_reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "school_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "school_roles" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "key" TEXT,
    "name" TEXT NOT NULL,
    "type" "role_type" NOT NULL DEFAULT 'CUSTOM',
    "scope" "role_scope" NOT NULL DEFAULT 'SCHOOL',
    "description" TEXT NOT NULL DEFAULT '',
    "permissions" JSONB NOT NULL DEFAULT '{}',
    "archived_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "school_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "membership_roles" (
    "school_id" UUID NOT NULL,
    "membership_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "membership_roles_pkey" PRIMARY KEY ("membership_id","role_id")
);

-- CreateTable
CREATE TABLE "membership_branches" (
    "school_id" UUID NOT NULL,
    "membership_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "membership_branches_pkey" PRIMARY KEY ("membership_id","branch_id")
);

-- CreateTable
CREATE TABLE "staff" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "staff_number" TEXT NOT NULL,
    "title" TEXT,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "gender" "gender",
    "phone" TEXT,
    "email" CITEXT,
    "address" TEXT,
    "emergency_contact_name" TEXT,
    "emergency_contact_phone" TEXT,
    "emergency_contact_relationship" TEXT,
    "position_title" TEXT,
    "department_id" UUID,
    "kind" "staff_kind" NOT NULL,
    "group" "staff_group" NOT NULL,
    "employment" "employment" NOT NULL DEFAULT 'FULL_TIME',
    "started_on" DATE,
    "all_branches" BOOLEAN NOT NULL DEFAULT false,
    "max_periods_per_week" INTEGER NOT NULL DEFAULT 30,
    "photo_file_id" UUID,
    "status" "staff_status" NOT NULL DEFAULT 'ACTIVE',
    "left_on" DATE,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_branches" (
    "school_id" UUID NOT NULL,
    "staff_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_branches_pkey" PRIMARY KEY ("staff_id","branch_id")
);

-- CreateTable
CREATE TABLE "staff_qualifications" (
    "school_id" UUID NOT NULL,
    "staff_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_qualifications_pkey" PRIMARY KEY ("staff_id","subject_id")
);

-- CreateTable
CREATE TABLE "staff_documents" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "staff_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" "document_status" NOT NULL DEFAULT 'PENDING',
    "file_id" UUID,
    "verified_by_id" UUID,
    "verified_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "staff_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guardians" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "title" TEXT,
    "full_name" TEXT NOT NULL,
    "phone" TEXT,
    "email" CITEXT,
    "address" TEXT,
    "occupation" TEXT,
    "preferred_payment_method" "payment_method",
    "contact_consent_at" TIMESTAMPTZ(3),
    "contact_consent_source" TEXT,
    "sms_opt_out" BOOLEAN NOT NULL DEFAULT false,
    "email_opt_out" BOOLEAN NOT NULL DEFAULT false,
    "merged_into_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "guardians_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "students" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "admission_no" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "surname" TEXT NOT NULL,
    "other_names" TEXT,
    "gender" "gender" NOT NULL,
    "date_of_birth" DATE,
    "state_of_origin" TEXT,
    "address" TEXT,
    "medical_notes" TEXT,
    "previous_school" TEXT,
    "photo_file_id" UUID,
    "status" "student_status" NOT NULL DEFAULT 'ACTIVE',
    "admission_type" "admission_type" NOT NULL DEFAULT 'NEW_INTAKE',
    "admitted_on" DATE NOT NULL,
    "admitted_level_id" UUID,
    "branch_id" UUID NOT NULL,
    "payment_plan_id" UUID,
    "exit_kind" "student_exit_kind",
    "exit_on" DATE,
    "exit_reason" TEXT,
    "exit_destination" TEXT,
    "exit_notes" TEXT,
    "exit_document_file_id" UUID,
    "graduated_on" DATE,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "students_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_guardians" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "guardian_id" UUID NOT NULL,
    "relationship" TEXT NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "pays_fees" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_guardians_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_documents" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "status" "document_status" NOT NULL DEFAULT 'PENDING',
    "file_id" UUID,
    "verified_by_id" UUID,
    "verified_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "student_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admission_applications" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "session_id" UUID NOT NULL,
    "branch_id" UUID,
    "applying_for_level_id" UUID NOT NULL,
    "type" "admission_type" NOT NULL DEFAULT 'NEW_INTAKE',
    "first_name" TEXT NOT NULL,
    "surname" TEXT NOT NULL,
    "other_names" TEXT,
    "gender" "gender",
    "date_of_birth" DATE,
    "note" TEXT,
    "guardian_name" TEXT,
    "guardian_phone" TEXT,
    "guardian_email" CITEXT,
    "applied_on" DATE NOT NULL,
    "stage" "application_stage" NOT NULL DEFAULT 'PENDING',
    "stage_note" TEXT,
    "student_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admission_applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enrollments" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "level_id" UUID NOT NULL,
    "arm_id" UUID,
    "status" "enrollment_status" NOT NULL DEFAULT 'ACTIVE',
    "enrolled_on" DATE NOT NULL,
    "left_on" DATE,
    "outcome" "promotion_outcome",
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_roles" (
    "id" UUID NOT NULL,
    "key" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "permissions" JSONB NOT NULL DEFAULT '{}',
    "predefined" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_staff" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "status" "platform_staff_status" NOT NULL DEFAULT 'INVITED',
    "invited_by_id" UUID,
    "invited_at" TIMESTAMPTZ(3),
    "activated_at" TIMESTAMPTZ(3),
    "last_active_at" TIMESTAMPTZ(3),
    "new_device_alerts" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_staff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plans" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "status" "plan_status" NOT NULL DEFAULT 'DRAFT',
    "pricing_model" "pricing_model" NOT NULL,
    "annual_price_kobo" BIGINT,
    "term_price_kobo" BIGINT,
    "month_price_kobo" BIGINT,
    "per_student_kobo" BIGINT,
    "minimum_per_term_kobo" BIGINT,
    "trial_days" INTEGER NOT NULL DEFAULT 0,
    "setup_fee_kobo" BIGINT NOT NULL DEFAULT 0,
    "student_limit" INTEGER,
    "branch_limit" INTEGER,
    "user_limit" INTEGER,
    "storage_limit_gb" INTEGER,
    "sms_credits_per_term" INTEGER NOT NULL DEFAULT 0,
    "modules" TEXT[],
    "support_tier" "support_tier" NOT NULL DEFAULT 'STANDARD',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_versions" (
    "id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "summary" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plan_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "plan_version" INTEGER NOT NULL,
    "status" "subscription_status" NOT NULL DEFAULT 'ACTIVE',
    "billing_period" "billing_period" NOT NULL DEFAULT 'ANNUAL',
    "price_kobo" BIGINT NOT NULL,
    "started_on" DATE NOT NULL,
    "renews_on" DATE NOT NULL,
    "trial_ends_on" DATE,
    "grace_ends_on" DATE,
    "restricted_at" TIMESTAMPTZ(3),
    "cancelled_at" TIMESTAMPTZ(3),
    "status_reason" TEXT,
    "billing_contact_name" TEXT,
    "billing_contact_email" CITEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_invoices" (
    "id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "school_id" UUID NOT NULL,
    "subscription_id" UUID NOT NULL,
    "kind" "platform_invoice_kind" NOT NULL,
    "status" "platform_invoice_status" NOT NULL DEFAULT 'ISSUED',
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "amount_kobo" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'NGN',
    "issued_on" DATE NOT NULL,
    "due_on" DATE NOT NULL,
    "paid_at" TIMESTAMPTZ(3),
    "payment_reference" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_sessions" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "staff_user_id" UUID NOT NULL,
    "ticket_id" UUID,
    "mode" "support_session_mode" NOT NULL DEFAULT 'READ_ONLY',
    "reason" TEXT NOT NULL,
    "approved_by_id" UUID,
    "started_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "ended_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updated_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "public_holidays" (
    "id" UUID NOT NULL,
    "country" CHAR(2) NOT NULL DEFAULT 'NG',
    "date" DATE NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "public_holidays_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "result_sheets" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "term_id" UUID NOT NULL,
    "arm_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "scheme_id" UUID NOT NULL,
    "teaching_assignment_id" UUID,
    "teacher_staff_id" UUID,
    "status" "sheet_status" NOT NULL DEFAULT 'NOT_STARTED',
    "reviewer_staff_id" UUID,
    "saved_at" TIMESTAMPTZ(3),
    "submitted_at" TIMESTAMPTZ(3),
    "forwarded_at" TIMESTAMPTZ(3),
    "returned_at" TIMESTAMPTZ(3),
    "returned_by" "reviewer_kind",
    "return_note" TEXT,
    "approved_at" TIMESTAMPTZ(3),
    "approved_by_id" UUID,
    "published_at" TIMESTAMPTZ(3),
    "entry_reopened_until" TIMESTAMPTZ(3),
    "revision" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "result_sheets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "result_sheet_events" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "sheet_id" UUID NOT NULL,
    "action" "sheet_action" NOT NULL,
    "from_status" "sheet_status",
    "to_status" "sheet_status" NOT NULL,
    "actor_user_id" UUID,
    "actor_staff_id" UUID,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "result_sheet_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "result_entries" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "sheet_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "total" DECIMAL(5,2),
    "grade" TEXT,
    "rating_id" UUID,
    "teacher_remark" TEXT,
    "position" INTEGER,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "result_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "result_scores" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "entry_id" UUID NOT NULL,
    "component_id" UUID NOT NULL,
    "state" "score_state" NOT NULL,
    "score" DECIMAL(5,2),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "result_scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "score_corrections" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "sheet_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "component_id" UUID NOT NULL,
    "original_score" DECIMAL(5,2) NOT NULL,
    "proposed_score" DECIMAL(5,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "evidence_file_id" UUID,
    "status" "correction_status" NOT NULL DEFAULT 'UNDER_REVIEW',
    "requested_by_id" UUID NOT NULL,
    "requested_by_staff_id" UUID,
    "requested_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decided_by_id" UUID,
    "decided_at" TIMESTAMPTZ(3),
    "decision_note" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "score_corrections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "result_publications" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "term_id" UUID NOT NULL,
    "arm_id" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "published_at" TIMESTAMPTZ(3) NOT NULL,
    "published_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "result_publications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_cards" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "term_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "arm_id" UUID NOT NULL,
    "class_teacher_remark" TEXT,
    "remark_by_id" UUID,
    "remark_updated_at" TIMESTAMPTZ(3),
    "average" DECIMAL(5,2),
    "grade" TEXT,
    "position" INTEGER,
    "version" INTEGER NOT NULL DEFAULT 0,
    "published_at" TIMESTAMPTZ(3),
    "snapshot" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_cards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conduct_ratings" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "report_card_id" UUID NOT NULL,
    "trait" "conduct_trait" NOT NULL,
    "rating" SMALLINT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conduct_ratings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "result_sheet_reminders" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "sheet_id" UUID NOT NULL,
    "sent_by_id" UUID NOT NULL,
    "sent_on" DATE NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "result_sheet_reminders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promotion_decisions" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "enrollment_id" UUID NOT NULL,
    "to_session_id" UUID NOT NULL,
    "suggestion" "promotion_outcome",
    "average" DECIMAL(5,2),
    "eligible" BOOLEAN,
    "decision" "promotion_outcome",
    "reason" TEXT,
    "next_level_id" UUID,
    "next_arm_id" UUID,
    "decided_by_id" UUID,
    "decided_at" TIMESTAMPTZ(3),
    "applied_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "promotion_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schools" (
    "id" UUID NOT NULL,
    "slug" CITEXT NOT NULL,
    "custom_domain" CITEXT,
    "custom_domain_verified_at" TIMESTAMPTZ(3),
    "name" TEXT NOT NULL,
    "legal_name" TEXT NOT NULL,
    "school_type" TEXT,
    "ownership" "school_ownership" NOT NULL DEFAULT 'PRIVATE',
    "registration_number" TEXT,
    "status" "school_status" NOT NULL DEFAULT 'ONBOARDING',
    "brand_color" TEXT,
    "motto" TEXT,
    "founded_year" INTEGER,
    "logo_file_id" UUID,
    "certificate_file_id" UUID,
    "email" CITEXT,
    "phone" TEXT,
    "website" TEXT,
    "street" TEXT,
    "city" TEXT,
    "lga" TEXT,
    "state" TEXT,
    "country" CHAR(2) NOT NULL DEFAULT 'NG',
    "approving_body" TEXT,
    "approval_number" TEXT,
    "cac_number" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'Africa/Lagos',
    "currency" CHAR(3) NOT NULL DEFAULT 'NGN',
    "provisioned_at" TIMESTAMPTZ(3),
    "provisioned_by_id" UUID,
    "setup_finished_at" TIMESTAMPTZ(3),
    "suspended_at" TIMESTAMPTZ(3),
    "suspension_reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "schools_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "school_settings" (
    "school_id" UUID NOT NULL,
    "date_format" TEXT NOT NULL DEFAULT 'DD/MM/YYYY',
    "address_format" TEXT NOT NULL DEFAULT 'street, city, LGA, state',
    "admission_number_pattern" TEXT NOT NULL DEFAULT 'STU-[YYYY]-[####]',
    "staff_number_pattern" TEXT NOT NULL DEFAULT 'STF-[####]',
    "show_position" BOOLEAN NOT NULL DEFAULT false,
    "reweight_exempt" BOOLEAN NOT NULL DEFAULT true,
    "promotion_suggestions" BOOLEAN NOT NULL DEFAULT true,
    "block_promotion_on_fees" BOOLEAN NOT NULL DEFAULT false,
    "same_scheme_for_all_sections" BOOLEAN NOT NULL DEFAULT false,
    "promotion_rule" TEXT,
    "idle_timeout_minutes" INTEGER NOT NULL DEFAULT 30,
    "lockout_attempts" INTEGER NOT NULL DEFAULT 5,
    "lockout_minutes" INTEGER NOT NULL DEFAULT 15,
    "password_expiry_days" INTEGER NOT NULL DEFAULT 90,
    "register_edit_days" INTEGER NOT NULL DEFAULT 5,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "school_settings_pkey" PRIMARY KEY ("school_id")
);

-- CreateTable
CREATE TABLE "branches" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "street" TEXT,
    "city" TEXT,
    "lga" TEXT,
    "state" TEXT,
    "phone" TEXT,
    "email" CITEXT,
    "head_staff_id" UUID,
    "has_store" BOOLEAN NOT NULL DEFAULT false,
    "status" "branch_status" NOT NULL DEFAULT 'ACTIVE',
    "is_original" BOOLEAN NOT NULL DEFAULT false,
    "deactivated_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "branches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branch_sections" (
    "school_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "section_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "branch_sections_pkey" PRIMARY KEY ("branch_id","section_id")
);

-- CreateTable
CREATE TABLE "departments" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "is_academic" BOOLEAN NOT NULL DEFAULT true,
    "hod_staff_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "positions" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "parent_id" UUID,
    "responsibilities" TEXT NOT NULL DEFAULT '',
    "approvals" TEXT[],
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "positions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "position_holders" (
    "school_id" UUID NOT NULL,
    "position_id" UUID NOT NULL,
    "staff_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "position_holders_pkey" PRIMARY KEY ("position_id","staff_id")
);

-- CreateTable
CREATE TABLE "position_suggested_roles" (
    "school_id" UUID NOT NULL,
    "position_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "position_suggested_roles_pkey" PRIMARY KEY ("position_id","role_id")
);

-- CreateTable
CREATE TABLE "setup_step_states" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "step_key" TEXT NOT NULL,
    "confirmed_at" TIMESTAMPTZ(3),
    "confirmed_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "setup_step_states_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "number_sequences" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "kind" "number_kind" NOT NULL,
    "scope" TEXT NOT NULL DEFAULT '',
    "next_value" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "number_sequences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_batches" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "kind" "import_kind" NOT NULL,
    "status" "import_status" NOT NULL DEFAULT 'VALIDATED',
    "file_id" UUID,
    "file_name" TEXT NOT NULL,
    "target" TEXT,
    "row_count" INTEGER NOT NULL,
    "valid_count" INTEGER NOT NULL,
    "rows" JSONB NOT NULL,
    "issues" JSONB NOT NULL DEFAULT '[]',
    "result" JSONB,
    "created_by_id" UUID,
    "committed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_tickets" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "subject" VARCHAR(120) NOT NULL,
    "description" TEXT NOT NULL,
    "topic" "ticket_topic",
    "category" "ticket_category" NOT NULL,
    "priority" "ticket_priority" NOT NULL DEFAULT 'NORMAL',
    "status" "ticket_status" NOT NULL DEFAULT 'OPEN',
    "team" "support_team" NOT NULL DEFAULT 'TIER_1_SUPPORT',
    "requester_user_id" UUID,
    "requester_name" TEXT NOT NULL,
    "assignee_user_id" UUID,
    "escalated_to" TEXT,
    "escalated_from_user_id" UUID,
    "hold_reason" TEXT,
    "resolution" TEXT,
    "resolution_type" TEXT,
    "first_reply_at" TIMESTAMPTZ(3),
    "resolved_at" TIMESTAMPTZ(3),
    "auto_close_at" TIMESTAMPTZ(3),
    "closed_at" TIMESTAMPTZ(3),
    "paused_since" TIMESTAMPTZ(3),
    "paused_seconds" INTEGER NOT NULL DEFAULT 0,
    "sla_missed" BOOLEAN NOT NULL DEFAULT false,
    "reopen_count" INTEGER NOT NULL DEFAULT 0,
    "rating_score" SMALLINT,
    "rating_comment" TEXT,
    "follow_up_of_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_ticket_messages" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "ticket_id" UUID NOT NULL,
    "kind" "ticket_message_kind" NOT NULL,
    "author_user_id" UUID,
    "author_name" TEXT NOT NULL,
    "author_role" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_ticket_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_ticket_attachments" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "message_id" UUID NOT NULL,
    "file_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_ticket_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_ticket_events" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "ticket_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "detail" TEXT,
    "tone" "tone" NOT NULL DEFAULT 'NEUTRAL',
    "from_status" "ticket_status",
    "to_status" "ticket_status",
    "actor_user_id" UUID,
    "visible_to_school" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_ticket_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assignments" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "term_id" UUID NOT NULL,
    "arm_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "teacher_staff_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "instructions" TEXT NOT NULL DEFAULT '',
    "due_at" TIMESTAMPTZ(3),
    "max_score" SMALLINT,
    "allow_late" BOOLEAN NOT NULL DEFAULT false,
    "status" "assignment_status" NOT NULL DEFAULT 'DRAFT',
    "published_at" TIMESTAMPTZ(3),
    "closed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assignment_attachments" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "assignment_id" UUID NOT NULL,
    "file_id" UUID,
    "material_id" UUID,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assignment_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "submissions" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "assignment_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "status" "submission_status" NOT NULL DEFAULT 'NOT_SUBMITTED',
    "submitted_at" TIMESTAMPTZ(3),
    "is_late" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "score" DECIMAL(5,2),
    "feedback" TEXT NOT NULL DEFAULT '',
    "graded_at" TIMESTAMPTZ(3),
    "graded_by_id" UUID,
    "returned_at" TIMESTAMPTZ(3),
    "excuse_reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "submission_files" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "submission_id" UUID NOT NULL,
    "file_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "submission_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "materials" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "term_id" UUID NOT NULL,
    "arm_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "teacher_staff_id" UUID NOT NULL,
    "type" "material_type" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "file_id" UUID,
    "link_url" TEXT,
    "status" "material_status" NOT NULL DEFAULT 'PUBLISHED',
    "published_at" TIMESTAMPTZ(3) NOT NULL,
    "archived_at" TIMESTAMPTZ(3),
    "view_count" INTEGER NOT NULL DEFAULT 0,
    "last_viewed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "materials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "material_views" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "material_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "view_count" INTEGER NOT NULL DEFAULT 1,
    "first_viewed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_viewed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "material_views_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessment_schedules" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "term_id" UUID NOT NULL,
    "arm_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "component_id" UUID NOT NULL,
    "teaching_assignment_id" UUID,
    "scheduled_on" DATE NOT NULL,
    "topics" TEXT NOT NULL DEFAULT '',
    "instructions" TEXT NOT NULL DEFAULT '',
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assessment_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lesson_notes" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "term_id" UUID NOT NULL,
    "teacher_staff_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "level_id" UUID NOT NULL,
    "week" SMALLINT NOT NULL,
    "week_starts_on" DATE NOT NULL,
    "due_on" DATE NOT NULL,
    "topic" TEXT NOT NULL,
    "objectives" TEXT[],
    "content" TEXT NOT NULL,
    "scheme_topic" TEXT NOT NULL DEFAULT '',
    "attachment_file_id" UUID,
    "status" "lesson_note_status" NOT NULL DEFAULT 'DRAFT',
    "reviewer_staff_id" UUID,
    "filed_without_review" BOOLEAN NOT NULL DEFAULT false,
    "submitted_at" TIMESTAMPTZ(3),
    "decided_at" TIMESTAMPTZ(3),
    "decided_by_staff_id" UUID,
    "return_comment" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lesson_notes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sections_school_id_id_key" ON "sections"("school_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "sections_school_id_code_key" ON "sections"("school_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "sections_school_id_name_key" ON "sections"("school_id", "name");

-- CreateIndex
CREATE INDEX "academic_sessions_school_id_starts_on_idx" ON "academic_sessions"("school_id", "starts_on");

-- CreateIndex
CREATE UNIQUE INDEX "academic_sessions_school_id_id_key" ON "academic_sessions"("school_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "academic_sessions_school_id_name_key" ON "academic_sessions"("school_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "academic_sessions_one_active_key" ON "academic_sessions"("school_id", "status") WHERE (status = 'ACTIVE');

-- CreateIndex
CREATE INDEX "terms_school_id_starts_on_idx" ON "terms"("school_id", "starts_on");

-- CreateIndex
CREATE UNIQUE INDEX "terms_school_id_id_key" ON "terms"("school_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "terms_session_id_sequence_key" ON "terms"("session_id", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "terms_session_id_name_key" ON "terms"("session_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "terms_one_active_key" ON "terms"("school_id", "status") WHERE (status = 'ACTIVE');

-- CreateIndex
CREATE INDEX "term_events_school_id_term_id_starts_on_idx" ON "term_events"("school_id", "term_id", "starts_on");

-- CreateIndex
CREATE INDEX "calendar_events_school_id_session_id_starts_on_idx" ON "calendar_events"("school_id", "session_id", "starts_on");

-- CreateIndex
CREATE INDEX "class_levels_school_id_section_id_sort_order_idx" ON "class_levels"("school_id", "section_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "class_levels_school_id_id_key" ON "class_levels"("school_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "class_levels_school_id_name_key" ON "class_levels"("school_id", "name");

-- CreateIndex
CREATE INDEX "class_arms_school_id_level_id_idx" ON "class_arms"("school_id", "level_id");

-- CreateIndex
CREATE UNIQUE INDEX "class_arms_school_id_id_key" ON "class_arms"("school_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "class_arms_branch_id_level_id_name_key" ON "class_arms"("branch_id", "level_id", "name");

-- CreateIndex
CREATE INDEX "class_teacher_assignments_school_id_session_id_staff_id_idx" ON "class_teacher_assignments"("school_id", "session_id", "staff_id");

-- CreateIndex
CREATE UNIQUE INDEX "class_teacher_assignments_session_id_arm_id_key" ON "class_teacher_assignments"("session_id", "arm_id");

-- CreateIndex
CREATE INDEX "subjects_school_id_department_id_idx" ON "subjects"("school_id", "department_id");

-- CreateIndex
CREATE UNIQUE INDEX "subjects_school_id_id_key" ON "subjects"("school_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "subjects_school_id_code_key" ON "subjects"("school_id", "code");

-- CreateIndex
CREATE INDEX "curriculum_entries_school_id_subject_id_idx" ON "curriculum_entries"("school_id", "subject_id");

-- CreateIndex
CREATE UNIQUE INDEX "curriculum_entries_level_id_subject_id_key" ON "curriculum_entries"("level_id", "subject_id");

-- CreateIndex
CREATE UNIQUE INDEX "elective_groups_school_id_id_key" ON "elective_groups"("school_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "elective_groups_section_id_name_key" ON "elective_groups"("section_id", "name");

-- CreateIndex
CREATE INDEX "elective_group_subjects_school_id_subject_id_idx" ON "elective_group_subjects"("school_id", "subject_id");

-- CreateIndex
CREATE INDEX "student_subjects_school_id_session_id_subject_id_idx" ON "student_subjects"("school_id", "session_id", "subject_id");

-- CreateIndex
CREATE UNIQUE INDEX "student_subjects_student_id_session_id_subject_id_key" ON "student_subjects"("student_id", "session_id", "subject_id");

-- CreateIndex
CREATE INDEX "teaching_assignments_school_id_term_id_staff_id_idx" ON "teaching_assignments"("school_id", "term_id", "staff_id");

-- CreateIndex
CREATE INDEX "teaching_assignments_school_id_term_id_subject_id_idx" ON "teaching_assignments"("school_id", "term_id", "subject_id");

-- CreateIndex
CREATE UNIQUE INDEX "teaching_assignments_school_id_id_key" ON "teaching_assignments"("school_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "teaching_assignments_term_id_arm_id_subject_id_key" ON "teaching_assignments"("term_id", "arm_id", "subject_id");

-- CreateIndex
CREATE UNIQUE INDEX "timetable_periods_school_id_id_key" ON "timetable_periods"("school_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "timetable_periods_school_id_sort_order_key" ON "timetable_periods"("school_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "timetables_school_id_id_key" ON "timetables"("school_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "timetables_term_id_arm_id_key" ON "timetables"("term_id", "arm_id");

-- CreateIndex
CREATE INDEX "timetable_slots_school_id_term_id_staff_id_layer_day_idx" ON "timetable_slots"("school_id", "term_id", "staff_id", "layer", "day");

-- CreateIndex
CREATE UNIQUE INDEX "timetable_slots_timetable_id_layer_day_period_id_key" ON "timetable_slots"("timetable_id", "layer", "day", "period_id");

-- CreateIndex
CREATE UNIQUE INDEX "assessment_schemes_school_id_id_key" ON "assessment_schemes"("school_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "assessment_schemes_session_id_section_id_key" ON "assessment_schemes"("session_id", "section_id");

-- CreateIndex
CREATE UNIQUE INDEX "assessment_components_school_id_id_key" ON "assessment_components"("school_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "assessment_components_scheme_id_key_key" ON "assessment_components"("scheme_id", "key");

-- CreateIndex
CREATE UNIQUE INDEX "assessment_components_scheme_id_sort_order_key" ON "assessment_components"("scheme_id", "sort_order");

-- CreateIndex
CREATE INDEX "grade_bands_school_id_scheme_id_idx" ON "grade_bands"("school_id", "scheme_id");

-- CreateIndex
CREATE UNIQUE INDEX "grade_bands_scheme_id_grade_key" ON "grade_bands"("scheme_id", "grade");

-- CreateIndex
CREATE UNIQUE INDEX "descriptive_ratings_school_id_id_key" ON "descriptive_ratings"("school_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "descriptive_ratings_scheme_id_name_key" ON "descriptive_ratings"("scheme_id", "name");

-- CreateIndex
CREATE INDEX "attendance_registers_school_id_term_id_date_idx" ON "attendance_registers"("school_id", "term_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_registers_school_id_id_key" ON "attendance_registers"("school_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_registers_arm_id_date_key" ON "attendance_registers"("arm_id", "date");

-- CreateIndex
CREATE INDEX "attendance_entries_school_id_student_id_term_id_date_idx" ON "attendance_entries"("school_id", "student_id", "term_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_entries_register_id_student_id_key" ON "attendance_entries"("register_id", "student_id");

-- CreateIndex
CREATE INDEX "audit_events_school_id_created_at_idx" ON "audit_events"("school_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "audit_events_school_id_entity_type_entity_id_created_at_idx" ON "audit_events"("school_id", "entity_type", "entity_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_events_school_id_area_created_at_idx" ON "audit_events"("school_id", "area", "created_at");

-- CreateIndex
CREATE INDEX "audit_events_actor_user_id_created_at_idx" ON "audit_events"("actor_user_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_events_created_at_idx" ON "audit_events"("created_at");

-- CreateIndex
CREATE INDEX "sender_id_requests_school_id_created_at_idx" ON "sender_id_requests"("school_id", "created_at");

-- CreateIndex
CREATE INDEX "sender_id_requests_status_idx" ON "sender_id_requests"("status");

-- CreateIndex
CREATE INDEX "sms_credit_transactions_school_id_created_at_idx" ON "sms_credit_transactions"("school_id", "created_at");

-- CreateIndex
CREATE INDEX "sms_credit_transactions_school_id_term_id_kind_idx" ON "sms_credit_transactions"("school_id", "term_id", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "comms_event_settings_school_id_event_key" ON "comms_event_settings"("school_id", "event");

-- CreateIndex
CREATE UNIQUE INDEX "message_templates_school_id_event_channel_key" ON "message_templates"("school_id", "event", "channel");

-- CreateIndex
CREATE INDEX "announcements_school_id_status_created_at_idx" ON "announcements"("school_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "announcements_status_scheduled_for_idx" ON "announcements"("status", "scheduled_for");

-- CreateIndex
CREATE UNIQUE INDEX "announcements_school_id_id_key" ON "announcements"("school_id", "id");

-- CreateIndex
CREATE INDEX "announcement_arms_school_id_arm_id_idx" ON "announcement_arms"("school_id", "arm_id");

-- CreateIndex
CREATE INDEX "messages_school_id_created_at_idx" ON "messages"("school_id", "created_at");

-- CreateIndex
CREATE INDEX "messages_school_id_event_created_at_idx" ON "messages"("school_id", "event", "created_at");

-- CreateIndex
CREATE INDEX "messages_school_id_source_type_source_id_idx" ON "messages"("school_id", "source_type", "source_id");

-- CreateIndex
CREATE UNIQUE INDEX "messages_school_id_id_key" ON "messages"("school_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "messages_school_id_announcement_id_key" ON "messages"("school_id", "announcement_id");

-- CreateIndex
CREATE INDEX "message_recipients_school_id_message_id_idx" ON "message_recipients"("school_id", "message_id");

-- CreateIndex
CREATE INDEX "message_recipients_school_id_guardian_id_idx" ON "message_recipients"("school_id", "guardian_id");

-- CreateIndex
CREATE UNIQUE INDEX "message_recipients_school_id_id_key" ON "message_recipients"("school_id", "id");

-- CreateIndex
CREATE INDEX "message_deliveries_school_id_message_id_channel_status_idx" ON "message_deliveries"("school_id", "message_id", "channel", "status");

-- CreateIndex
CREATE INDEX "message_deliveries_school_id_status_created_at_idx" ON "message_deliveries"("school_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "message_deliveries_status_release_at_idx" ON "message_deliveries"("status", "release_at");

-- CreateIndex
CREATE INDEX "message_deliveries_provider_message_id_idx" ON "message_deliveries"("provider_message_id");

-- CreateIndex
CREATE UNIQUE INDEX "message_deliveries_recipient_id_channel_key" ON "message_deliveries"("recipient_id", "channel");

-- CreateIndex
CREATE INDEX "notifications_user_id_school_id_created_at_idx" ON "notifications"("user_id", "school_id", "created_at");

-- CreateIndex
CREATE INDEX "notifications_user_id_read_at_idx" ON "notifications"("user_id", "read_at");

-- CreateIndex
CREATE INDEX "notification_preferences_school_id_idx" ON "notification_preferences"("school_id");

-- CreateIndex
CREATE UNIQUE INDEX "notification_preferences_school_key" ON "notification_preferences"("user_id", "school_id", "event") WHERE (school_id IS NOT NULL);

-- CreateIndex
CREATE UNIQUE INDEX "notification_preferences_platform_key" ON "notification_preferences"("user_id", "event") WHERE (school_id IS NULL);

-- CreateIndex
CREATE UNIQUE INDEX "stored_files_storage_key_key" ON "stored_files"("storage_key");

-- CreateIndex
CREATE INDEX "stored_files_school_id_created_at_idx" ON "stored_files"("school_id", "created_at");

-- CreateIndex
CREATE INDEX "stored_files_sha256_idx" ON "stored_files"("sha256");

-- CreateIndex
CREATE UNIQUE INDEX "stored_files_school_id_id_key" ON "stored_files"("school_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "fee_items_school_id_id_key" ON "fee_items"("school_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "fee_items_school_id_name_key" ON "fee_items"("school_id", "name");

-- CreateIndex
CREATE INDEX "fee_structures_school_id_term_id_idx" ON "fee_structures"("school_id", "term_id");

-- CreateIndex
CREATE UNIQUE INDEX "fee_structures_school_id_id_key" ON "fee_structures"("school_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "fee_structures_term_id_branch_id_key" ON "fee_structures"("term_id", "branch_id");

-- CreateIndex
CREATE INDEX "fee_structure_amounts_school_id_fee_item_id_idx" ON "fee_structure_amounts"("school_id", "fee_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "fee_structure_amounts_structure_id_level_id_fee_item_id_key" ON "fee_structure_amounts"("structure_id", "level_id", "fee_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "discounts_school_id_id_key" ON "discounts"("school_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "discounts_school_id_name_key" ON "discounts"("school_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "payment_plans_school_id_id_key" ON "payment_plans"("school_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_plans_school_id_name_key" ON "payment_plans"("school_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "payment_plans_one_default_key" ON "payment_plans"("school_id", "is_default") WHERE (is_default);

-- CreateIndex
CREATE INDEX "payment_plan_installments_school_id_idx" ON "payment_plan_installments"("school_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_plan_installments_plan_id_sequence_key" ON "payment_plan_installments"("plan_id", "sequence");

-- CreateIndex
CREATE INDEX "invoices_school_id_term_id_status_idx" ON "invoices"("school_id", "term_id", "status");

-- CreateIndex
CREATE INDEX "invoices_school_id_branch_id_term_id_idx" ON "invoices"("school_id", "branch_id", "term_id");

-- CreateIndex
CREATE INDEX "invoices_school_id_status_due_on_idx" ON "invoices"("school_id", "status", "due_on");

-- CreateIndex
CREATE INDEX "invoices_school_id_student_id_idx" ON "invoices"("school_id", "student_id");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_school_id_id_key" ON "invoices"("school_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_school_id_number_key" ON "invoices"("school_id", "number");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_one_live_per_term_key" ON "invoices"("student_id", "term_id") WHERE (status <> 'CANCELLED');

-- CreateIndex
CREATE INDEX "invoice_lines_school_id_invoice_id_idx" ON "invoice_lines"("school_id", "invoice_id");

-- CreateIndex
CREATE INDEX "invoice_lines_school_id_fee_item_id_idx" ON "invoice_lines"("school_id", "fee_item_id");

-- CreateIndex
CREATE INDEX "invoice_discounts_school_id_invoice_id_idx" ON "invoice_discounts"("school_id", "invoice_id");

-- CreateIndex
CREATE INDEX "invoice_discounts_school_id_discount_id_idx" ON "invoice_discounts"("school_id", "discount_id");

-- CreateIndex
CREATE INDEX "invoice_installments_school_id_due_on_idx" ON "invoice_installments"("school_id", "due_on");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_installments_invoice_id_sequence_key" ON "invoice_installments"("invoice_id", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "bank_accounts_school_id_id_key" ON "bank_accounts"("school_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "bank_accounts_school_id_name_key" ON "bank_accounts"("school_id", "name");

-- CreateIndex
CREATE INDEX "payments_school_id_status_paid_on_idx" ON "payments"("school_id", "status", "paid_on");

-- CreateIndex
CREATE INDEX "payments_school_id_student_id_idx" ON "payments"("school_id", "student_id");

-- CreateIndex
CREATE INDEX "payments_school_id_bank_account_id_paid_on_idx" ON "payments"("school_id", "bank_account_id", "paid_on");

-- CreateIndex
CREATE INDEX "payments_school_id_branch_id_paid_on_idx" ON "payments"("school_id", "branch_id", "paid_on");

-- CreateIndex
CREATE INDEX "payments_school_id_reference_idx" ON "payments"("school_id", "reference");

-- CreateIndex
CREATE UNIQUE INDEX "payments_school_id_id_key" ON "payments"("school_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_school_id_number_key" ON "payments"("school_id", "number");

-- CreateIndex
CREATE INDEX "payment_allocations_school_id_invoice_id_idx" ON "payment_allocations"("school_id", "invoice_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_allocations_payment_id_invoice_id_key" ON "payment_allocations"("payment_id", "invoice_id");

-- CreateIndex
CREATE INDEX "credit_applications_school_id_student_id_idx" ON "credit_applications"("school_id", "student_id");

-- CreateIndex
CREATE INDEX "credit_applications_school_id_invoice_id_idx" ON "credit_applications"("school_id", "invoice_id");

-- CreateIndex
CREATE INDEX "refunds_school_id_status_requested_at_idx" ON "refunds"("school_id", "status", "requested_at");

-- CreateIndex
CREATE INDEX "refunds_school_id_student_id_idx" ON "refunds"("school_id", "student_id");

-- CreateIndex
CREATE UNIQUE INDEX "refunds_school_id_number_key" ON "refunds"("school_id", "number");

-- CreateIndex
CREATE INDEX "account_transfers_school_id_from_account_id_transferred_on_idx" ON "account_transfers"("school_id", "from_account_id", "transferred_on");

-- CreateIndex
CREATE INDEX "account_transfers_school_id_to_account_id_transferred_on_idx" ON "account_transfers"("school_id", "to_account_id", "transferred_on");

-- CreateIndex
CREATE UNIQUE INDEX "account_transfers_school_id_number_key" ON "account_transfers"("school_id", "number");

-- CreateIndex
CREATE INDEX "bank_statements_school_id_bank_account_id_created_at_idx" ON "bank_statements"("school_id", "bank_account_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "bank_statements_school_id_id_key" ON "bank_statements"("school_id", "id");

-- CreateIndex
CREATE INDEX "bank_statement_lines_school_id_payment_id_idx" ON "bank_statement_lines"("school_id", "payment_id");

-- CreateIndex
CREATE UNIQUE INDEX "bank_statement_lines_statement_id_line_no_key" ON "bank_statement_lines"("statement_id", "line_no");

-- CreateIndex
CREATE UNIQUE INDEX "vendors_school_id_id_key" ON "vendors"("school_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "vendors_school_id_name_key" ON "vendors"("school_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "expense_categories_school_id_id_key" ON "expense_categories"("school_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "expense_categories_school_id_name_key" ON "expense_categories"("school_id", "name");

-- CreateIndex
CREATE INDEX "expenses_school_id_status_spent_on_idx" ON "expenses"("school_id", "status", "spent_on");

-- CreateIndex
CREATE INDEX "expenses_school_id_branch_id_spent_on_idx" ON "expenses"("school_id", "branch_id", "spent_on");

-- CreateIndex
CREATE INDEX "expenses_school_id_vendor_id_idx" ON "expenses"("school_id", "vendor_id");

-- CreateIndex
CREATE INDEX "expenses_school_id_category_id_idx" ON "expenses"("school_id", "category_id");

-- CreateIndex
CREATE UNIQUE INDEX "expenses_school_id_id_key" ON "expenses"("school_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "expenses_school_id_number_key" ON "expenses"("school_id", "number");

-- CreateIndex
CREATE INDEX "expense_approvals_school_id_idx" ON "expense_approvals"("school_id");

-- CreateIndex
CREATE UNIQUE INDEX "expense_approvals_expense_id_role_key" ON "expense_approvals"("expense_id", "role");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_last_seen_at_idx" ON "users"("last_seen_at");

-- CreateIndex
CREATE UNIQUE INDEX "auth_sessions_refresh_token_hash_key" ON "auth_sessions"("refresh_token_hash");

-- CreateIndex
CREATE INDEX "auth_sessions_user_id_revoked_at_idx" ON "auth_sessions"("user_id", "revoked_at");

-- CreateIndex
CREATE INDEX "auth_sessions_school_id_last_seen_at_idx" ON "auth_sessions"("school_id", "last_seen_at");

-- CreateIndex
CREATE INDEX "auth_sessions_expires_at_idx" ON "auth_sessions"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_token_hash_key" ON "password_reset_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "password_reset_tokens_user_id_created_at_idx" ON "password_reset_tokens"("user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "invitations_token_hash_key" ON "invitations"("token_hash");

-- CreateIndex
CREATE INDEX "invitations_school_id_status_created_at_idx" ON "invitations"("school_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "invitations_user_id_idx" ON "invitations"("user_id");

-- CreateIndex
CREATE INDEX "invitations_membership_id_idx" ON "invitations"("membership_id");

-- CreateIndex
CREATE INDEX "invitations_platform_staff_id_idx" ON "invitations"("platform_staff_id");

-- CreateIndex
CREATE INDEX "invitations_status_expires_at_idx" ON "invitations"("status", "expires_at");

-- CreateIndex
CREATE INDEX "school_memberships_user_id_idx" ON "school_memberships"("user_id");

-- CreateIndex
CREATE INDEX "school_memberships_school_id_kind_status_idx" ON "school_memberships"("school_id", "kind", "status");

-- CreateIndex
CREATE UNIQUE INDEX "school_memberships_school_id_id_key" ON "school_memberships"("school_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "school_memberships_school_id_user_id_kind_key" ON "school_memberships"("school_id", "user_id", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "school_memberships_school_id_staff_id_key" ON "school_memberships"("school_id", "staff_id");

-- CreateIndex
CREATE UNIQUE INDEX "school_memberships_school_id_guardian_id_key" ON "school_memberships"("school_id", "guardian_id");

-- CreateIndex
CREATE UNIQUE INDEX "school_memberships_school_id_student_id_key" ON "school_memberships"("school_id", "student_id");

-- CreateIndex
CREATE UNIQUE INDEX "school_roles_school_id_id_key" ON "school_roles"("school_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "school_roles_school_id_name_key" ON "school_roles"("school_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "school_roles_school_id_key_key" ON "school_roles"("school_id", "key");

-- CreateIndex
CREATE INDEX "membership_roles_school_id_role_id_idx" ON "membership_roles"("school_id", "role_id");

-- CreateIndex
CREATE INDEX "membership_branches_school_id_branch_id_idx" ON "membership_branches"("school_id", "branch_id");

-- CreateIndex
CREATE INDEX "staff_school_id_status_group_idx" ON "staff"("school_id", "status", "group");

-- CreateIndex
CREATE INDEX "staff_school_id_last_name_first_name_idx" ON "staff"("school_id", "last_name", "first_name");

-- CreateIndex
CREATE INDEX "staff_school_id_department_id_idx" ON "staff"("school_id", "department_id");

-- CreateIndex
CREATE INDEX "staff_school_id_email_idx" ON "staff"("school_id", "email");

-- CreateIndex
CREATE UNIQUE INDEX "staff_school_id_id_key" ON "staff"("school_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "staff_school_id_staff_number_key" ON "staff"("school_id", "staff_number");

-- CreateIndex
CREATE INDEX "staff_branches_school_id_branch_id_idx" ON "staff_branches"("school_id", "branch_id");

-- CreateIndex
CREATE INDEX "staff_qualifications_school_id_subject_id_idx" ON "staff_qualifications"("school_id", "subject_id");

-- CreateIndex
CREATE INDEX "staff_documents_school_id_staff_id_idx" ON "staff_documents"("school_id", "staff_id");

-- CreateIndex
CREATE INDEX "guardians_school_id_phone_idx" ON "guardians"("school_id", "phone");

-- CreateIndex
CREATE INDEX "guardians_school_id_email_idx" ON "guardians"("school_id", "email");

-- CreateIndex
CREATE INDEX "guardians_school_id_full_name_idx" ON "guardians"("school_id", "full_name");

-- CreateIndex
CREATE UNIQUE INDEX "guardians_school_id_id_key" ON "guardians"("school_id", "id");

-- CreateIndex
CREATE INDEX "students_school_id_status_idx" ON "students"("school_id", "status");

-- CreateIndex
CREATE INDEX "students_school_id_branch_id_status_idx" ON "students"("school_id", "branch_id", "status");

-- CreateIndex
CREATE INDEX "students_school_id_surname_first_name_idx" ON "students"("school_id", "surname", "first_name");

-- CreateIndex
CREATE INDEX "students_school_id_admitted_on_idx" ON "students"("school_id", "admitted_on");

-- CreateIndex
CREATE UNIQUE INDEX "students_school_id_id_key" ON "students"("school_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "students_school_id_admission_no_key" ON "students"("school_id", "admission_no");

-- CreateIndex
CREATE INDEX "student_guardians_school_id_guardian_id_idx" ON "student_guardians"("school_id", "guardian_id");

-- CreateIndex
CREATE UNIQUE INDEX "student_guardians_student_id_guardian_id_key" ON "student_guardians"("student_id", "guardian_id");

-- CreateIndex
CREATE UNIQUE INDEX "student_guardians_one_primary_key" ON "student_guardians"("student_id", "is_primary") WHERE (is_primary);

-- CreateIndex
CREATE INDEX "student_documents_school_id_student_id_idx" ON "student_documents"("school_id", "student_id");

-- CreateIndex
CREATE UNIQUE INDEX "student_documents_student_id_key_key" ON "student_documents"("student_id", "key") WHERE (deleted_at IS NULL);

-- CreateIndex
CREATE INDEX "admission_applications_school_id_session_id_stage_idx" ON "admission_applications"("school_id", "session_id", "stage");

-- CreateIndex
CREATE UNIQUE INDEX "admission_applications_school_id_number_key" ON "admission_applications"("school_id", "number");

-- CreateIndex
CREATE UNIQUE INDEX "admission_applications_school_id_student_id_key" ON "admission_applications"("school_id", "student_id");

-- CreateIndex
CREATE INDEX "enrollments_school_id_session_id_arm_id_status_idx" ON "enrollments"("school_id", "session_id", "arm_id", "status");

-- CreateIndex
CREATE INDEX "enrollments_school_id_session_id_level_id_idx" ON "enrollments"("school_id", "session_id", "level_id");

-- CreateIndex
CREATE INDEX "enrollments_school_id_session_id_branch_id_idx" ON "enrollments"("school_id", "session_id", "branch_id");

-- CreateIndex
CREATE UNIQUE INDEX "enrollments_school_id_id_key" ON "enrollments"("school_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "enrollments_student_id_session_id_key" ON "enrollments"("student_id", "session_id");

-- CreateIndex
CREATE UNIQUE INDEX "platform_roles_key_key" ON "platform_roles"("key");

-- CreateIndex
CREATE UNIQUE INDEX "platform_roles_name_key" ON "platform_roles"("name");

-- CreateIndex
CREATE UNIQUE INDEX "platform_staff_user_id_key" ON "platform_staff"("user_id");

-- CreateIndex
CREATE INDEX "platform_staff_role_id_idx" ON "platform_staff"("role_id");

-- CreateIndex
CREATE INDEX "platform_staff_status_idx" ON "platform_staff"("status");

-- CreateIndex
CREATE UNIQUE INDEX "plans_name_key" ON "plans"("name");

-- CreateIndex
CREATE UNIQUE INDEX "plan_versions_plan_id_version_key" ON "plan_versions"("plan_id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_school_id_key" ON "subscriptions"("school_id");

-- CreateIndex
CREATE INDEX "subscriptions_plan_id_idx" ON "subscriptions"("plan_id");

-- CreateIndex
CREATE INDEX "subscriptions_status_renews_on_idx" ON "subscriptions"("status", "renews_on");

-- CreateIndex
CREATE UNIQUE INDEX "platform_invoices_number_key" ON "platform_invoices"("number");

-- CreateIndex
CREATE INDEX "platform_invoices_school_id_issued_on_idx" ON "platform_invoices"("school_id", "issued_on");

-- CreateIndex
CREATE INDEX "platform_invoices_status_due_on_idx" ON "platform_invoices"("status", "due_on");

-- CreateIndex
CREATE INDEX "platform_invoices_issued_on_idx" ON "platform_invoices"("issued_on");

-- CreateIndex
CREATE INDEX "support_sessions_school_id_started_at_idx" ON "support_sessions"("school_id", "started_at");

-- CreateIndex
CREATE INDEX "support_sessions_staff_user_id_started_at_idx" ON "support_sessions"("staff_user_id", "started_at");

-- CreateIndex
CREATE INDEX "public_holidays_date_idx" ON "public_holidays"("date");

-- CreateIndex
CREATE UNIQUE INDEX "public_holidays_country_date_name_key" ON "public_holidays"("country", "date", "name");

-- CreateIndex
CREATE INDEX "result_sheets_school_id_term_id_status_idx" ON "result_sheets"("school_id", "term_id", "status");

-- CreateIndex
CREATE INDEX "result_sheets_school_id_term_id_teacher_staff_id_idx" ON "result_sheets"("school_id", "term_id", "teacher_staff_id");

-- CreateIndex
CREATE INDEX "result_sheets_school_id_reviewer_staff_id_status_idx" ON "result_sheets"("school_id", "reviewer_staff_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "result_sheets_school_id_id_key" ON "result_sheets"("school_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "result_sheets_term_id_arm_id_subject_id_key" ON "result_sheets"("term_id", "arm_id", "subject_id");

-- CreateIndex
CREATE INDEX "result_sheet_events_school_id_sheet_id_created_at_idx" ON "result_sheet_events"("school_id", "sheet_id", "created_at");

-- CreateIndex
CREATE INDEX "result_sheet_events_school_id_actor_staff_id_created_at_idx" ON "result_sheet_events"("school_id", "actor_staff_id", "created_at");

-- CreateIndex
CREATE INDEX "result_entries_school_id_student_id_idx" ON "result_entries"("school_id", "student_id");

-- CreateIndex
CREATE UNIQUE INDEX "result_entries_school_id_id_key" ON "result_entries"("school_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "result_entries_sheet_id_student_id_key" ON "result_entries"("sheet_id", "student_id");

-- CreateIndex
CREATE INDEX "result_scores_school_id_component_id_idx" ON "result_scores"("school_id", "component_id");

-- CreateIndex
CREATE UNIQUE INDEX "result_scores_entry_id_component_id_key" ON "result_scores"("entry_id", "component_id");

-- CreateIndex
CREATE INDEX "score_corrections_school_id_status_requested_at_idx" ON "score_corrections"("school_id", "status", "requested_at");

-- CreateIndex
CREATE INDEX "score_corrections_school_id_sheet_id_idx" ON "score_corrections"("school_id", "sheet_id");

-- CreateIndex
CREATE UNIQUE INDEX "score_corrections_one_open_key" ON "score_corrections"("sheet_id", "student_id", "component_id") WHERE (status = 'UNDER_REVIEW');

-- CreateIndex
CREATE INDEX "result_publications_school_id_term_id_idx" ON "result_publications"("school_id", "term_id");

-- CreateIndex
CREATE UNIQUE INDEX "result_publications_term_id_arm_id_key" ON "result_publications"("term_id", "arm_id");

-- CreateIndex
CREATE INDEX "report_cards_school_id_term_id_arm_id_idx" ON "report_cards"("school_id", "term_id", "arm_id");

-- CreateIndex
CREATE UNIQUE INDEX "report_cards_school_id_id_key" ON "report_cards"("school_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "report_cards_term_id_student_id_key" ON "report_cards"("term_id", "student_id");

-- CreateIndex
CREATE INDEX "conduct_ratings_school_id_idx" ON "conduct_ratings"("school_id");

-- CreateIndex
CREATE UNIQUE INDEX "conduct_ratings_report_card_id_trait_key" ON "conduct_ratings"("report_card_id", "trait");

-- CreateIndex
CREATE INDEX "result_sheet_reminders_school_id_idx" ON "result_sheet_reminders"("school_id");

-- CreateIndex
CREATE UNIQUE INDEX "result_sheet_reminders_sheet_id_sent_on_key" ON "result_sheet_reminders"("sheet_id", "sent_on");

-- CreateIndex
CREATE INDEX "promotion_decisions_school_id_to_session_id_idx" ON "promotion_decisions"("school_id", "to_session_id");

-- CreateIndex
CREATE UNIQUE INDEX "promotion_decisions_enrollment_id_key" ON "promotion_decisions"("enrollment_id");

-- CreateIndex
CREATE UNIQUE INDEX "schools_slug_key" ON "schools"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "schools_custom_domain_key" ON "schools"("custom_domain");

-- CreateIndex
CREATE INDEX "schools_status_idx" ON "schools"("status");

-- CreateIndex
CREATE INDEX "schools_state_idx" ON "schools"("state");

-- CreateIndex
CREATE INDEX "schools_created_at_idx" ON "schools"("created_at");

-- CreateIndex
CREATE INDEX "branches_school_id_status_idx" ON "branches"("school_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "branches_school_id_id_key" ON "branches"("school_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "branches_school_id_code_key" ON "branches"("school_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "branches_school_id_name_key" ON "branches"("school_id", "name");

-- CreateIndex
CREATE INDEX "branch_sections_school_id_section_id_idx" ON "branch_sections"("school_id", "section_id");

-- CreateIndex
CREATE INDEX "departments_school_id_hod_staff_id_idx" ON "departments"("school_id", "hod_staff_id");

-- CreateIndex
CREATE UNIQUE INDEX "departments_school_id_id_key" ON "departments"("school_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "departments_school_id_name_key" ON "departments"("school_id", "name");

-- CreateIndex
CREATE INDEX "positions_school_id_parent_id_idx" ON "positions"("school_id", "parent_id");

-- CreateIndex
CREATE UNIQUE INDEX "positions_school_id_id_key" ON "positions"("school_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "positions_school_id_title_key" ON "positions"("school_id", "title");

-- CreateIndex
CREATE INDEX "position_holders_school_id_staff_id_idx" ON "position_holders"("school_id", "staff_id");

-- CreateIndex
CREATE INDEX "position_suggested_roles_school_id_role_id_idx" ON "position_suggested_roles"("school_id", "role_id");

-- CreateIndex
CREATE UNIQUE INDEX "setup_step_states_school_id_step_key_key" ON "setup_step_states"("school_id", "step_key");

-- CreateIndex
CREATE UNIQUE INDEX "number_sequences_school_id_kind_scope_key" ON "number_sequences"("school_id", "kind", "scope");

-- CreateIndex
CREATE INDEX "import_batches_school_id_kind_created_at_idx" ON "import_batches"("school_id", "kind", "created_at");

-- CreateIndex
CREATE INDEX "support_tickets_school_id_status_updated_at_idx" ON "support_tickets"("school_id", "status", "updated_at");

-- CreateIndex
CREATE INDEX "support_tickets_status_priority_created_at_idx" ON "support_tickets"("status", "priority", "created_at");

-- CreateIndex
CREATE INDEX "support_tickets_assignee_user_id_status_idx" ON "support_tickets"("assignee_user_id", "status");

-- CreateIndex
CREATE INDEX "support_tickets_created_at_idx" ON "support_tickets"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "support_tickets_school_id_id_key" ON "support_tickets"("school_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "support_tickets_school_id_number_key" ON "support_tickets"("school_id", "number");

-- CreateIndex
CREATE INDEX "support_ticket_messages_school_id_ticket_id_created_at_idx" ON "support_ticket_messages"("school_id", "ticket_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "support_ticket_messages_school_id_id_key" ON "support_ticket_messages"("school_id", "id");

-- CreateIndex
CREATE INDEX "support_ticket_attachments_school_id_idx" ON "support_ticket_attachments"("school_id");

-- CreateIndex
CREATE UNIQUE INDEX "support_ticket_attachments_message_id_file_id_key" ON "support_ticket_attachments"("message_id", "file_id");

-- CreateIndex
CREATE INDEX "support_ticket_events_school_id_ticket_id_created_at_idx" ON "support_ticket_events"("school_id", "ticket_id", "created_at");

-- CreateIndex
CREATE INDEX "assignments_school_id_term_id_teacher_staff_id_status_idx" ON "assignments"("school_id", "term_id", "teacher_staff_id", "status");

-- CreateIndex
CREATE INDEX "assignments_school_id_term_id_arm_id_subject_id_idx" ON "assignments"("school_id", "term_id", "arm_id", "subject_id");

-- CreateIndex
CREATE INDEX "assignments_school_id_status_due_at_idx" ON "assignments"("school_id", "status", "due_at");

-- CreateIndex
CREATE UNIQUE INDEX "assignments_school_id_id_key" ON "assignments"("school_id", "id");

-- CreateIndex
CREATE INDEX "assignment_attachments_school_id_assignment_id_idx" ON "assignment_attachments"("school_id", "assignment_id");

-- CreateIndex
CREATE INDEX "assignment_attachments_school_id_material_id_idx" ON "assignment_attachments"("school_id", "material_id");

-- CreateIndex
CREATE INDEX "submissions_school_id_assignment_id_status_idx" ON "submissions"("school_id", "assignment_id", "status");

-- CreateIndex
CREATE INDEX "submissions_school_id_student_id_idx" ON "submissions"("school_id", "student_id");

-- CreateIndex
CREATE UNIQUE INDEX "submissions_school_id_id_key" ON "submissions"("school_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "submissions_assignment_id_student_id_key" ON "submissions"("assignment_id", "student_id");

-- CreateIndex
CREATE INDEX "submission_files_school_id_idx" ON "submission_files"("school_id");

-- CreateIndex
CREATE UNIQUE INDEX "submission_files_submission_id_file_id_key" ON "submission_files"("submission_id", "file_id");

-- CreateIndex
CREATE INDEX "materials_school_id_term_id_teacher_staff_id_status_idx" ON "materials"("school_id", "term_id", "teacher_staff_id", "status");

-- CreateIndex
CREATE INDEX "materials_school_id_term_id_arm_id_subject_id_idx" ON "materials"("school_id", "term_id", "arm_id", "subject_id");

-- CreateIndex
CREATE UNIQUE INDEX "materials_school_id_id_key" ON "materials"("school_id", "id");

-- CreateIndex
CREATE INDEX "material_views_school_id_student_id_idx" ON "material_views"("school_id", "student_id");

-- CreateIndex
CREATE UNIQUE INDEX "material_views_material_id_student_id_key" ON "material_views"("material_id", "student_id");

-- CreateIndex
CREATE INDEX "assessment_schedules_school_id_term_id_scheduled_on_idx" ON "assessment_schedules"("school_id", "term_id", "scheduled_on");

-- CreateIndex
CREATE UNIQUE INDEX "assessment_schedules_term_id_arm_id_subject_id_component_id_key" ON "assessment_schedules"("term_id", "arm_id", "subject_id", "component_id");

-- CreateIndex
CREATE INDEX "lesson_notes_school_id_term_id_teacher_staff_id_status_idx" ON "lesson_notes"("school_id", "term_id", "teacher_staff_id", "status");

-- CreateIndex
CREATE INDEX "lesson_notes_school_id_reviewer_staff_id_status_idx" ON "lesson_notes"("school_id", "reviewer_staff_id", "status");

-- CreateIndex
CREATE INDEX "lesson_notes_school_id_decided_by_staff_id_decided_at_idx" ON "lesson_notes"("school_id", "decided_by_staff_id", "decided_at");

-- CreateIndex
CREATE UNIQUE INDEX "lesson_notes_term_id_teacher_staff_id_subject_id_level_id_w_key" ON "lesson_notes"("term_id", "teacher_staff_id", "subject_id", "level_id", "week");

-- AddForeignKey
ALTER TABLE "sections" ADD CONSTRAINT "sections_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_sessions" ADD CONSTRAINT "academic_sessions_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_sessions" ADD CONSTRAINT "academic_sessions_school_id_copied_from_id_fkey" FOREIGN KEY ("school_id", "copied_from_id") REFERENCES "academic_sessions"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "terms" ADD CONSTRAINT "terms_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "terms" ADD CONSTRAINT "terms_school_id_session_id_fkey" FOREIGN KEY ("school_id", "session_id") REFERENCES "academic_sessions"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "term_events" ADD CONSTRAINT "term_events_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "term_events" ADD CONSTRAINT "term_events_school_id_term_id_fkey" FOREIGN KEY ("school_id", "term_id") REFERENCES "terms"("school_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_school_id_session_id_fkey" FOREIGN KEY ("school_id", "session_id") REFERENCES "academic_sessions"("school_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_levels" ADD CONSTRAINT "class_levels_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_levels" ADD CONSTRAINT "class_levels_school_id_section_id_fkey" FOREIGN KEY ("school_id", "section_id") REFERENCES "sections"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_levels" ADD CONSTRAINT "class_levels_school_id_next_level_id_fkey" FOREIGN KEY ("school_id", "next_level_id") REFERENCES "class_levels"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_arms" ADD CONSTRAINT "class_arms_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_arms" ADD CONSTRAINT "class_arms_school_id_branch_id_fkey" FOREIGN KEY ("school_id", "branch_id") REFERENCES "branches"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_arms" ADD CONSTRAINT "class_arms_school_id_level_id_fkey" FOREIGN KEY ("school_id", "level_id") REFERENCES "class_levels"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_teacher_assignments" ADD CONSTRAINT "class_teacher_assignments_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_teacher_assignments" ADD CONSTRAINT "class_teacher_assignments_school_id_session_id_fkey" FOREIGN KEY ("school_id", "session_id") REFERENCES "academic_sessions"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_teacher_assignments" ADD CONSTRAINT "class_teacher_assignments_school_id_arm_id_fkey" FOREIGN KEY ("school_id", "arm_id") REFERENCES "class_arms"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_teacher_assignments" ADD CONSTRAINT "class_teacher_assignments_school_id_staff_id_fkey" FOREIGN KEY ("school_id", "staff_id") REFERENCES "staff"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subjects" ADD CONSTRAINT "subjects_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subjects" ADD CONSTRAINT "subjects_school_id_department_id_fkey" FOREIGN KEY ("school_id", "department_id") REFERENCES "departments"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "curriculum_entries" ADD CONSTRAINT "curriculum_entries_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "curriculum_entries" ADD CONSTRAINT "curriculum_entries_school_id_level_id_fkey" FOREIGN KEY ("school_id", "level_id") REFERENCES "class_levels"("school_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "curriculum_entries" ADD CONSTRAINT "curriculum_entries_school_id_subject_id_fkey" FOREIGN KEY ("school_id", "subject_id") REFERENCES "subjects"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "elective_groups" ADD CONSTRAINT "elective_groups_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "elective_groups" ADD CONSTRAINT "elective_groups_school_id_section_id_fkey" FOREIGN KEY ("school_id", "section_id") REFERENCES "sections"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "elective_group_subjects" ADD CONSTRAINT "elective_group_subjects_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "elective_group_subjects" ADD CONSTRAINT "elective_group_subjects_school_id_group_id_fkey" FOREIGN KEY ("school_id", "group_id") REFERENCES "elective_groups"("school_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "elective_group_subjects" ADD CONSTRAINT "elective_group_subjects_school_id_subject_id_fkey" FOREIGN KEY ("school_id", "subject_id") REFERENCES "subjects"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_subjects" ADD CONSTRAINT "student_subjects_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_subjects" ADD CONSTRAINT "student_subjects_school_id_student_id_fkey" FOREIGN KEY ("school_id", "student_id") REFERENCES "students"("school_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_subjects" ADD CONSTRAINT "student_subjects_school_id_session_id_fkey" FOREIGN KEY ("school_id", "session_id") REFERENCES "academic_sessions"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_subjects" ADD CONSTRAINT "student_subjects_school_id_subject_id_fkey" FOREIGN KEY ("school_id", "subject_id") REFERENCES "subjects"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_subjects" ADD CONSTRAINT "student_subjects_school_id_group_id_fkey" FOREIGN KEY ("school_id", "group_id") REFERENCES "elective_groups"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teaching_assignments" ADD CONSTRAINT "teaching_assignments_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teaching_assignments" ADD CONSTRAINT "teaching_assignments_school_id_term_id_fkey" FOREIGN KEY ("school_id", "term_id") REFERENCES "terms"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teaching_assignments" ADD CONSTRAINT "teaching_assignments_school_id_arm_id_fkey" FOREIGN KEY ("school_id", "arm_id") REFERENCES "class_arms"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teaching_assignments" ADD CONSTRAINT "teaching_assignments_school_id_subject_id_fkey" FOREIGN KEY ("school_id", "subject_id") REFERENCES "subjects"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teaching_assignments" ADD CONSTRAINT "teaching_assignments_school_id_staff_id_fkey" FOREIGN KEY ("school_id", "staff_id") REFERENCES "staff"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_periods" ADD CONSTRAINT "timetable_periods_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetables" ADD CONSTRAINT "timetables_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetables" ADD CONSTRAINT "timetables_school_id_term_id_fkey" FOREIGN KEY ("school_id", "term_id") REFERENCES "terms"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetables" ADD CONSTRAINT "timetables_school_id_arm_id_fkey" FOREIGN KEY ("school_id", "arm_id") REFERENCES "class_arms"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_slots" ADD CONSTRAINT "timetable_slots_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_slots" ADD CONSTRAINT "timetable_slots_school_id_timetable_id_fkey" FOREIGN KEY ("school_id", "timetable_id") REFERENCES "timetables"("school_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_slots" ADD CONSTRAINT "timetable_slots_school_id_term_id_fkey" FOREIGN KEY ("school_id", "term_id") REFERENCES "terms"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_slots" ADD CONSTRAINT "timetable_slots_school_id_period_id_fkey" FOREIGN KEY ("school_id", "period_id") REFERENCES "timetable_periods"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_slots" ADD CONSTRAINT "timetable_slots_school_id_subject_id_fkey" FOREIGN KEY ("school_id", "subject_id") REFERENCES "subjects"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_slots" ADD CONSTRAINT "timetable_slots_school_id_staff_id_fkey" FOREIGN KEY ("school_id", "staff_id") REFERENCES "staff"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_schemes" ADD CONSTRAINT "assessment_schemes_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_schemes" ADD CONSTRAINT "assessment_schemes_school_id_session_id_fkey" FOREIGN KEY ("school_id", "session_id") REFERENCES "academic_sessions"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_schemes" ADD CONSTRAINT "assessment_schemes_school_id_section_id_fkey" FOREIGN KEY ("school_id", "section_id") REFERENCES "sections"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_components" ADD CONSTRAINT "assessment_components_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_components" ADD CONSTRAINT "assessment_components_school_id_scheme_id_fkey" FOREIGN KEY ("school_id", "scheme_id") REFERENCES "assessment_schemes"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_bands" ADD CONSTRAINT "grade_bands_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_bands" ADD CONSTRAINT "grade_bands_school_id_scheme_id_fkey" FOREIGN KEY ("school_id", "scheme_id") REFERENCES "assessment_schemes"("school_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "descriptive_ratings" ADD CONSTRAINT "descriptive_ratings_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "descriptive_ratings" ADD CONSTRAINT "descriptive_ratings_school_id_scheme_id_fkey" FOREIGN KEY ("school_id", "scheme_id") REFERENCES "assessment_schemes"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_registers" ADD CONSTRAINT "attendance_registers_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_registers" ADD CONSTRAINT "attendance_registers_school_id_term_id_fkey" FOREIGN KEY ("school_id", "term_id") REFERENCES "terms"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_registers" ADD CONSTRAINT "attendance_registers_school_id_arm_id_fkey" FOREIGN KEY ("school_id", "arm_id") REFERENCES "class_arms"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_entries" ADD CONSTRAINT "attendance_entries_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_entries" ADD CONSTRAINT "attendance_entries_school_id_register_id_fkey" FOREIGN KEY ("school_id", "register_id") REFERENCES "attendance_registers"("school_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_entries" ADD CONSTRAINT "attendance_entries_school_id_student_id_fkey" FOREIGN KEY ("school_id", "student_id") REFERENCES "students"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_entries" ADD CONSTRAINT "attendance_entries_school_id_term_id_fkey" FOREIGN KEY ("school_id", "term_id") REFERENCES "terms"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_settings" ADD CONSTRAINT "communication_settings_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sender_id_requests" ADD CONSTRAINT "sender_id_requests_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sms_credit_transactions" ADD CONSTRAINT "sms_credit_transactions_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sms_credit_transactions" ADD CONSTRAINT "sms_credit_transactions_school_id_message_id_fkey" FOREIGN KEY ("school_id", "message_id") REFERENCES "messages"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sms_credit_transactions" ADD CONSTRAINT "sms_credit_transactions_school_id_term_id_fkey" FOREIGN KEY ("school_id", "term_id") REFERENCES "terms"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comms_event_settings" ADD CONSTRAINT "comms_event_settings_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_templates" ADD CONSTRAINT "message_templates_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_school_id_audience_branch_id_fkey" FOREIGN KEY ("school_id", "audience_branch_id") REFERENCES "branches"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcement_arms" ADD CONSTRAINT "announcement_arms_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcement_arms" ADD CONSTRAINT "announcement_arms_school_id_announcement_id_fkey" FOREIGN KEY ("school_id", "announcement_id") REFERENCES "announcements"("school_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcement_arms" ADD CONSTRAINT "announcement_arms_school_id_arm_id_fkey" FOREIGN KEY ("school_id", "arm_id") REFERENCES "class_arms"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_school_id_announcement_id_fkey" FOREIGN KEY ("school_id", "announcement_id") REFERENCES "announcements"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_recipients" ADD CONSTRAINT "message_recipients_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_recipients" ADD CONSTRAINT "message_recipients_school_id_message_id_fkey" FOREIGN KEY ("school_id", "message_id") REFERENCES "messages"("school_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_recipients" ADD CONSTRAINT "message_recipients_school_id_guardian_id_fkey" FOREIGN KEY ("school_id", "guardian_id") REFERENCES "guardians"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_recipients" ADD CONSTRAINT "message_recipients_school_id_student_id_fkey" FOREIGN KEY ("school_id", "student_id") REFERENCES "students"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_recipients" ADD CONSTRAINT "message_recipients_school_id_staff_id_fkey" FOREIGN KEY ("school_id", "staff_id") REFERENCES "staff"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_deliveries" ADD CONSTRAINT "message_deliveries_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_deliveries" ADD CONSTRAINT "message_deliveries_school_id_message_id_fkey" FOREIGN KEY ("school_id", "message_id") REFERENCES "messages"("school_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_deliveries" ADD CONSTRAINT "message_deliveries_school_id_recipient_id_fkey" FOREIGN KEY ("school_id", "recipient_id") REFERENCES "message_recipients"("school_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stored_files" ADD CONSTRAINT "stored_files_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_settings" ADD CONSTRAINT "finance_settings_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_items" ADD CONSTRAINT "fee_items_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_structures" ADD CONSTRAINT "fee_structures_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_structures" ADD CONSTRAINT "fee_structures_school_id_term_id_fkey" FOREIGN KEY ("school_id", "term_id") REFERENCES "terms"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_structures" ADD CONSTRAINT "fee_structures_school_id_branch_id_fkey" FOREIGN KEY ("school_id", "branch_id") REFERENCES "branches"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_structure_amounts" ADD CONSTRAINT "fee_structure_amounts_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_structure_amounts" ADD CONSTRAINT "fee_structure_amounts_school_id_structure_id_fkey" FOREIGN KEY ("school_id", "structure_id") REFERENCES "fee_structures"("school_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_structure_amounts" ADD CONSTRAINT "fee_structure_amounts_school_id_level_id_fkey" FOREIGN KEY ("school_id", "level_id") REFERENCES "class_levels"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_structure_amounts" ADD CONSTRAINT "fee_structure_amounts_school_id_fee_item_id_fkey" FOREIGN KEY ("school_id", "fee_item_id") REFERENCES "fee_items"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discounts" ADD CONSTRAINT "discounts_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_plans" ADD CONSTRAINT "payment_plans_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_plan_installments" ADD CONSTRAINT "payment_plan_installments_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_plan_installments" ADD CONSTRAINT "payment_plan_installments_school_id_plan_id_fkey" FOREIGN KEY ("school_id", "plan_id") REFERENCES "payment_plans"("school_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_school_id_student_id_fkey" FOREIGN KEY ("school_id", "student_id") REFERENCES "students"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_school_id_term_id_fkey" FOREIGN KEY ("school_id", "term_id") REFERENCES "terms"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_school_id_branch_id_fkey" FOREIGN KEY ("school_id", "branch_id") REFERENCES "branches"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_school_id_level_id_fkey" FOREIGN KEY ("school_id", "level_id") REFERENCES "class_levels"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_school_id_arm_id_fkey" FOREIGN KEY ("school_id", "arm_id") REFERENCES "class_arms"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_school_id_payment_plan_id_fkey" FOREIGN KEY ("school_id", "payment_plan_id") REFERENCES "payment_plans"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_school_id_invoice_id_fkey" FOREIGN KEY ("school_id", "invoice_id") REFERENCES "invoices"("school_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_school_id_fee_item_id_fkey" FOREIGN KEY ("school_id", "fee_item_id") REFERENCES "fee_items"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_discounts" ADD CONSTRAINT "invoice_discounts_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_discounts" ADD CONSTRAINT "invoice_discounts_school_id_invoice_id_fkey" FOREIGN KEY ("school_id", "invoice_id") REFERENCES "invoices"("school_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_discounts" ADD CONSTRAINT "invoice_discounts_school_id_discount_id_fkey" FOREIGN KEY ("school_id", "discount_id") REFERENCES "discounts"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_installments" ADD CONSTRAINT "invoice_installments_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_installments" ADD CONSTRAINT "invoice_installments_school_id_invoice_id_fkey" FOREIGN KEY ("school_id", "invoice_id") REFERENCES "invoices"("school_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_school_id_branch_id_fkey" FOREIGN KEY ("school_id", "branch_id") REFERENCES "branches"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_school_id_student_id_fkey" FOREIGN KEY ("school_id", "student_id") REFERENCES "students"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_school_id_bank_account_id_fkey" FOREIGN KEY ("school_id", "bank_account_id") REFERENCES "bank_accounts"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_school_id_branch_id_fkey" FOREIGN KEY ("school_id", "branch_id") REFERENCES "branches"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_school_id_claimed_by_guardian_id_fkey" FOREIGN KEY ("school_id", "claimed_by_guardian_id") REFERENCES "guardians"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_school_id_proof_file_id_fkey" FOREIGN KEY ("school_id", "proof_file_id") REFERENCES "stored_files"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_school_id_payment_id_fkey" FOREIGN KEY ("school_id", "payment_id") REFERENCES "payments"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_school_id_invoice_id_fkey" FOREIGN KEY ("school_id", "invoice_id") REFERENCES "invoices"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_applications" ADD CONSTRAINT "credit_applications_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_applications" ADD CONSTRAINT "credit_applications_school_id_student_id_fkey" FOREIGN KEY ("school_id", "student_id") REFERENCES "students"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_applications" ADD CONSTRAINT "credit_applications_school_id_invoice_id_fkey" FOREIGN KEY ("school_id", "invoice_id") REFERENCES "invoices"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_school_id_student_id_fkey" FOREIGN KEY ("school_id", "student_id") REFERENCES "students"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_school_id_payment_id_fkey" FOREIGN KEY ("school_id", "payment_id") REFERENCES "payments"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_school_id_paid_from_account_id_fkey" FOREIGN KEY ("school_id", "paid_from_account_id") REFERENCES "bank_accounts"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_transfers" ADD CONSTRAINT "account_transfers_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_transfers" ADD CONSTRAINT "account_transfers_school_id_from_account_id_fkey" FOREIGN KEY ("school_id", "from_account_id") REFERENCES "bank_accounts"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_transfers" ADD CONSTRAINT "account_transfers_school_id_to_account_id_fkey" FOREIGN KEY ("school_id", "to_account_id") REFERENCES "bank_accounts"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_statements" ADD CONSTRAINT "bank_statements_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_statements" ADD CONSTRAINT "bank_statements_school_id_bank_account_id_fkey" FOREIGN KEY ("school_id", "bank_account_id") REFERENCES "bank_accounts"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_statements" ADD CONSTRAINT "bank_statements_school_id_file_id_fkey" FOREIGN KEY ("school_id", "file_id") REFERENCES "stored_files"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_statement_lines" ADD CONSTRAINT "bank_statement_lines_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_statement_lines" ADD CONSTRAINT "bank_statement_lines_school_id_statement_id_fkey" FOREIGN KEY ("school_id", "statement_id") REFERENCES "bank_statements"("school_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_statement_lines" ADD CONSTRAINT "bank_statement_lines_school_id_payment_id_fkey" FOREIGN KEY ("school_id", "payment_id") REFERENCES "payments"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_categories" ADD CONSTRAINT "expense_categories_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_school_id_category_id_fkey" FOREIGN KEY ("school_id", "category_id") REFERENCES "expense_categories"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_school_id_vendor_id_fkey" FOREIGN KEY ("school_id", "vendor_id") REFERENCES "vendors"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_school_id_branch_id_fkey" FOREIGN KEY ("school_id", "branch_id") REFERENCES "branches"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_school_id_paid_from_account_id_fkey" FOREIGN KEY ("school_id", "paid_from_account_id") REFERENCES "bank_accounts"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_school_id_attachment_file_id_fkey" FOREIGN KEY ("school_id", "attachment_file_id") REFERENCES "stored_files"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_approvals" ADD CONSTRAINT "expense_approvals_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_approvals" ADD CONSTRAINT "expense_approvals_school_id_expense_id_fkey" FOREIGN KEY ("school_id", "expense_id") REFERENCES "expenses"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_avatar_file_id_fkey" FOREIGN KEY ("avatar_file_id") REFERENCES "stored_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_school_id_membership_id_fkey" FOREIGN KEY ("school_id", "membership_id") REFERENCES "school_memberships"("school_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_platform_staff_id_fkey" FOREIGN KEY ("platform_staff_id") REFERENCES "platform_staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "school_memberships" ADD CONSTRAINT "school_memberships_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "school_memberships" ADD CONSTRAINT "school_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "school_memberships" ADD CONSTRAINT "school_memberships_school_id_staff_id_fkey" FOREIGN KEY ("school_id", "staff_id") REFERENCES "staff"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "school_memberships" ADD CONSTRAINT "school_memberships_school_id_guardian_id_fkey" FOREIGN KEY ("school_id", "guardian_id") REFERENCES "guardians"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "school_memberships" ADD CONSTRAINT "school_memberships_school_id_student_id_fkey" FOREIGN KEY ("school_id", "student_id") REFERENCES "students"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "school_roles" ADD CONSTRAINT "school_roles_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_roles" ADD CONSTRAINT "membership_roles_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_roles" ADD CONSTRAINT "membership_roles_school_id_membership_id_fkey" FOREIGN KEY ("school_id", "membership_id") REFERENCES "school_memberships"("school_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_roles" ADD CONSTRAINT "membership_roles_school_id_role_id_fkey" FOREIGN KEY ("school_id", "role_id") REFERENCES "school_roles"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_branches" ADD CONSTRAINT "membership_branches_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_branches" ADD CONSTRAINT "membership_branches_school_id_membership_id_fkey" FOREIGN KEY ("school_id", "membership_id") REFERENCES "school_memberships"("school_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_branches" ADD CONSTRAINT "membership_branches_school_id_branch_id_fkey" FOREIGN KEY ("school_id", "branch_id") REFERENCES "branches"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff" ADD CONSTRAINT "staff_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff" ADD CONSTRAINT "staff_school_id_department_id_fkey" FOREIGN KEY ("school_id", "department_id") REFERENCES "departments"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff" ADD CONSTRAINT "staff_school_id_photo_file_id_fkey" FOREIGN KEY ("school_id", "photo_file_id") REFERENCES "stored_files"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_branches" ADD CONSTRAINT "staff_branches_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_branches" ADD CONSTRAINT "staff_branches_school_id_staff_id_fkey" FOREIGN KEY ("school_id", "staff_id") REFERENCES "staff"("school_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_branches" ADD CONSTRAINT "staff_branches_school_id_branch_id_fkey" FOREIGN KEY ("school_id", "branch_id") REFERENCES "branches"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_qualifications" ADD CONSTRAINT "staff_qualifications_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_qualifications" ADD CONSTRAINT "staff_qualifications_school_id_staff_id_fkey" FOREIGN KEY ("school_id", "staff_id") REFERENCES "staff"("school_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_qualifications" ADD CONSTRAINT "staff_qualifications_school_id_subject_id_fkey" FOREIGN KEY ("school_id", "subject_id") REFERENCES "subjects"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_documents" ADD CONSTRAINT "staff_documents_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_documents" ADD CONSTRAINT "staff_documents_school_id_staff_id_fkey" FOREIGN KEY ("school_id", "staff_id") REFERENCES "staff"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_documents" ADD CONSTRAINT "staff_documents_school_id_file_id_fkey" FOREIGN KEY ("school_id", "file_id") REFERENCES "stored_files"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guardians" ADD CONSTRAINT "guardians_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guardians" ADD CONSTRAINT "guardians_school_id_merged_into_id_fkey" FOREIGN KEY ("school_id", "merged_into_id") REFERENCES "guardians"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_school_id_branch_id_fkey" FOREIGN KEY ("school_id", "branch_id") REFERENCES "branches"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_school_id_admitted_level_id_fkey" FOREIGN KEY ("school_id", "admitted_level_id") REFERENCES "class_levels"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_school_id_payment_plan_id_fkey" FOREIGN KEY ("school_id", "payment_plan_id") REFERENCES "payment_plans"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_school_id_photo_file_id_fkey" FOREIGN KEY ("school_id", "photo_file_id") REFERENCES "stored_files"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_school_id_exit_document_file_id_fkey" FOREIGN KEY ("school_id", "exit_document_file_id") REFERENCES "stored_files"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_guardians" ADD CONSTRAINT "student_guardians_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_guardians" ADD CONSTRAINT "student_guardians_school_id_student_id_fkey" FOREIGN KEY ("school_id", "student_id") REFERENCES "students"("school_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_guardians" ADD CONSTRAINT "student_guardians_school_id_guardian_id_fkey" FOREIGN KEY ("school_id", "guardian_id") REFERENCES "guardians"("school_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_documents" ADD CONSTRAINT "student_documents_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_documents" ADD CONSTRAINT "student_documents_school_id_student_id_fkey" FOREIGN KEY ("school_id", "student_id") REFERENCES "students"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_documents" ADD CONSTRAINT "student_documents_school_id_file_id_fkey" FOREIGN KEY ("school_id", "file_id") REFERENCES "stored_files"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_applications" ADD CONSTRAINT "admission_applications_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_applications" ADD CONSTRAINT "admission_applications_school_id_session_id_fkey" FOREIGN KEY ("school_id", "session_id") REFERENCES "academic_sessions"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_applications" ADD CONSTRAINT "admission_applications_school_id_branch_id_fkey" FOREIGN KEY ("school_id", "branch_id") REFERENCES "branches"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_applications" ADD CONSTRAINT "admission_applications_school_id_applying_for_level_id_fkey" FOREIGN KEY ("school_id", "applying_for_level_id") REFERENCES "class_levels"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_applications" ADD CONSTRAINT "admission_applications_school_id_student_id_fkey" FOREIGN KEY ("school_id", "student_id") REFERENCES "students"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_school_id_student_id_fkey" FOREIGN KEY ("school_id", "student_id") REFERENCES "students"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_school_id_session_id_fkey" FOREIGN KEY ("school_id", "session_id") REFERENCES "academic_sessions"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_school_id_branch_id_fkey" FOREIGN KEY ("school_id", "branch_id") REFERENCES "branches"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_school_id_level_id_fkey" FOREIGN KEY ("school_id", "level_id") REFERENCES "class_levels"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_school_id_arm_id_fkey" FOREIGN KEY ("school_id", "arm_id") REFERENCES "class_arms"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_staff" ADD CONSTRAINT "platform_staff_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_staff" ADD CONSTRAINT "platform_staff_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "platform_roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_versions" ADD CONSTRAINT "plan_versions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_invoices" ADD CONSTRAINT "platform_invoices_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_invoices" ADD CONSTRAINT "platform_invoices_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_sessions" ADD CONSTRAINT "support_sessions_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_sessions" ADD CONSTRAINT "support_sessions_staff_user_id_fkey" FOREIGN KEY ("staff_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_sessions" ADD CONSTRAINT "support_sessions_school_id_ticket_id_fkey" FOREIGN KEY ("school_id", "ticket_id") REFERENCES "support_tickets"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "result_sheets" ADD CONSTRAINT "result_sheets_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "result_sheets" ADD CONSTRAINT "result_sheets_school_id_term_id_fkey" FOREIGN KEY ("school_id", "term_id") REFERENCES "terms"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "result_sheets" ADD CONSTRAINT "result_sheets_school_id_arm_id_fkey" FOREIGN KEY ("school_id", "arm_id") REFERENCES "class_arms"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "result_sheets" ADD CONSTRAINT "result_sheets_school_id_subject_id_fkey" FOREIGN KEY ("school_id", "subject_id") REFERENCES "subjects"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "result_sheets" ADD CONSTRAINT "result_sheets_school_id_scheme_id_fkey" FOREIGN KEY ("school_id", "scheme_id") REFERENCES "assessment_schemes"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "result_sheets" ADD CONSTRAINT "result_sheets_school_id_teaching_assignment_id_fkey" FOREIGN KEY ("school_id", "teaching_assignment_id") REFERENCES "teaching_assignments"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "result_sheets" ADD CONSTRAINT "result_sheets_school_id_teacher_staff_id_fkey" FOREIGN KEY ("school_id", "teacher_staff_id") REFERENCES "staff"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "result_sheets" ADD CONSTRAINT "result_sheets_school_id_reviewer_staff_id_fkey" FOREIGN KEY ("school_id", "reviewer_staff_id") REFERENCES "staff"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "result_sheet_events" ADD CONSTRAINT "result_sheet_events_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "result_sheet_events" ADD CONSTRAINT "result_sheet_events_school_id_sheet_id_fkey" FOREIGN KEY ("school_id", "sheet_id") REFERENCES "result_sheets"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "result_entries" ADD CONSTRAINT "result_entries_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "result_entries" ADD CONSTRAINT "result_entries_school_id_sheet_id_fkey" FOREIGN KEY ("school_id", "sheet_id") REFERENCES "result_sheets"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "result_entries" ADD CONSTRAINT "result_entries_school_id_student_id_fkey" FOREIGN KEY ("school_id", "student_id") REFERENCES "students"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "result_entries" ADD CONSTRAINT "result_entries_school_id_rating_id_fkey" FOREIGN KEY ("school_id", "rating_id") REFERENCES "descriptive_ratings"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "result_scores" ADD CONSTRAINT "result_scores_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "result_scores" ADD CONSTRAINT "result_scores_school_id_entry_id_fkey" FOREIGN KEY ("school_id", "entry_id") REFERENCES "result_entries"("school_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "result_scores" ADD CONSTRAINT "result_scores_school_id_component_id_fkey" FOREIGN KEY ("school_id", "component_id") REFERENCES "assessment_components"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "score_corrections" ADD CONSTRAINT "score_corrections_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "score_corrections" ADD CONSTRAINT "score_corrections_school_id_sheet_id_fkey" FOREIGN KEY ("school_id", "sheet_id") REFERENCES "result_sheets"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "score_corrections" ADD CONSTRAINT "score_corrections_school_id_student_id_fkey" FOREIGN KEY ("school_id", "student_id") REFERENCES "students"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "score_corrections" ADD CONSTRAINT "score_corrections_school_id_component_id_fkey" FOREIGN KEY ("school_id", "component_id") REFERENCES "assessment_components"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "score_corrections" ADD CONSTRAINT "score_corrections_school_id_evidence_file_id_fkey" FOREIGN KEY ("school_id", "evidence_file_id") REFERENCES "stored_files"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "result_publications" ADD CONSTRAINT "result_publications_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "result_publications" ADD CONSTRAINT "result_publications_school_id_term_id_fkey" FOREIGN KEY ("school_id", "term_id") REFERENCES "terms"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "result_publications" ADD CONSTRAINT "result_publications_school_id_arm_id_fkey" FOREIGN KEY ("school_id", "arm_id") REFERENCES "class_arms"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_cards" ADD CONSTRAINT "report_cards_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_cards" ADD CONSTRAINT "report_cards_school_id_term_id_fkey" FOREIGN KEY ("school_id", "term_id") REFERENCES "terms"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_cards" ADD CONSTRAINT "report_cards_school_id_student_id_fkey" FOREIGN KEY ("school_id", "student_id") REFERENCES "students"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_cards" ADD CONSTRAINT "report_cards_school_id_arm_id_fkey" FOREIGN KEY ("school_id", "arm_id") REFERENCES "class_arms"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conduct_ratings" ADD CONSTRAINT "conduct_ratings_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conduct_ratings" ADD CONSTRAINT "conduct_ratings_school_id_report_card_id_fkey" FOREIGN KEY ("school_id", "report_card_id") REFERENCES "report_cards"("school_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "result_sheet_reminders" ADD CONSTRAINT "result_sheet_reminders_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "result_sheet_reminders" ADD CONSTRAINT "result_sheet_reminders_school_id_sheet_id_fkey" FOREIGN KEY ("school_id", "sheet_id") REFERENCES "result_sheets"("school_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotion_decisions" ADD CONSTRAINT "promotion_decisions_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotion_decisions" ADD CONSTRAINT "promotion_decisions_school_id_enrollment_id_fkey" FOREIGN KEY ("school_id", "enrollment_id") REFERENCES "enrollments"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotion_decisions" ADD CONSTRAINT "promotion_decisions_school_id_to_session_id_fkey" FOREIGN KEY ("school_id", "to_session_id") REFERENCES "academic_sessions"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotion_decisions" ADD CONSTRAINT "promotion_decisions_school_id_next_level_id_fkey" FOREIGN KEY ("school_id", "next_level_id") REFERENCES "class_levels"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotion_decisions" ADD CONSTRAINT "promotion_decisions_school_id_next_arm_id_fkey" FOREIGN KEY ("school_id", "next_arm_id") REFERENCES "class_arms"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schools" ADD CONSTRAINT "schools_logo_file_id_fkey" FOREIGN KEY ("logo_file_id") REFERENCES "stored_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schools" ADD CONSTRAINT "schools_certificate_file_id_fkey" FOREIGN KEY ("certificate_file_id") REFERENCES "stored_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "school_settings" ADD CONSTRAINT "school_settings_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branches" ADD CONSTRAINT "branches_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branches" ADD CONSTRAINT "branches_school_id_head_staff_id_fkey" FOREIGN KEY ("school_id", "head_staff_id") REFERENCES "staff"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_sections" ADD CONSTRAINT "branch_sections_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_sections" ADD CONSTRAINT "branch_sections_school_id_branch_id_fkey" FOREIGN KEY ("school_id", "branch_id") REFERENCES "branches"("school_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_sections" ADD CONSTRAINT "branch_sections_school_id_section_id_fkey" FOREIGN KEY ("school_id", "section_id") REFERENCES "sections"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departments" ADD CONSTRAINT "departments_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departments" ADD CONSTRAINT "departments_school_id_hod_staff_id_fkey" FOREIGN KEY ("school_id", "hod_staff_id") REFERENCES "staff"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "positions" ADD CONSTRAINT "positions_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "positions" ADD CONSTRAINT "positions_school_id_parent_id_fkey" FOREIGN KEY ("school_id", "parent_id") REFERENCES "positions"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "position_holders" ADD CONSTRAINT "position_holders_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "position_holders" ADD CONSTRAINT "position_holders_school_id_position_id_fkey" FOREIGN KEY ("school_id", "position_id") REFERENCES "positions"("school_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "position_holders" ADD CONSTRAINT "position_holders_school_id_staff_id_fkey" FOREIGN KEY ("school_id", "staff_id") REFERENCES "staff"("school_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "position_suggested_roles" ADD CONSTRAINT "position_suggested_roles_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "position_suggested_roles" ADD CONSTRAINT "position_suggested_roles_school_id_position_id_fkey" FOREIGN KEY ("school_id", "position_id") REFERENCES "positions"("school_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "position_suggested_roles" ADD CONSTRAINT "position_suggested_roles_school_id_role_id_fkey" FOREIGN KEY ("school_id", "role_id") REFERENCES "school_roles"("school_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "setup_step_states" ADD CONSTRAINT "setup_step_states_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "number_sequences" ADD CONSTRAINT "number_sequences_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_school_id_file_id_fkey" FOREIGN KEY ("school_id", "file_id") REFERENCES "stored_files"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_requester_user_id_fkey" FOREIGN KEY ("requester_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_assignee_user_id_fkey" FOREIGN KEY ("assignee_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_school_id_follow_up_of_id_fkey" FOREIGN KEY ("school_id", "follow_up_of_id") REFERENCES "support_tickets"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_ticket_messages" ADD CONSTRAINT "support_ticket_messages_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_ticket_messages" ADD CONSTRAINT "support_ticket_messages_school_id_ticket_id_fkey" FOREIGN KEY ("school_id", "ticket_id") REFERENCES "support_tickets"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_ticket_attachments" ADD CONSTRAINT "support_ticket_attachments_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_ticket_attachments" ADD CONSTRAINT "support_ticket_attachments_school_id_message_id_fkey" FOREIGN KEY ("school_id", "message_id") REFERENCES "support_ticket_messages"("school_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_ticket_attachments" ADD CONSTRAINT "support_ticket_attachments_school_id_file_id_fkey" FOREIGN KEY ("school_id", "file_id") REFERENCES "stored_files"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_ticket_events" ADD CONSTRAINT "support_ticket_events_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_ticket_events" ADD CONSTRAINT "support_ticket_events_school_id_ticket_id_fkey" FOREIGN KEY ("school_id", "ticket_id") REFERENCES "support_tickets"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_school_id_term_id_fkey" FOREIGN KEY ("school_id", "term_id") REFERENCES "terms"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_school_id_arm_id_fkey" FOREIGN KEY ("school_id", "arm_id") REFERENCES "class_arms"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_school_id_subject_id_fkey" FOREIGN KEY ("school_id", "subject_id") REFERENCES "subjects"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_school_id_teacher_staff_id_fkey" FOREIGN KEY ("school_id", "teacher_staff_id") REFERENCES "staff"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_attachments" ADD CONSTRAINT "assignment_attachments_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_attachments" ADD CONSTRAINT "assignment_attachments_school_id_assignment_id_fkey" FOREIGN KEY ("school_id", "assignment_id") REFERENCES "assignments"("school_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_attachments" ADD CONSTRAINT "assignment_attachments_school_id_file_id_fkey" FOREIGN KEY ("school_id", "file_id") REFERENCES "stored_files"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_attachments" ADD CONSTRAINT "assignment_attachments_school_id_material_id_fkey" FOREIGN KEY ("school_id", "material_id") REFERENCES "materials"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_school_id_assignment_id_fkey" FOREIGN KEY ("school_id", "assignment_id") REFERENCES "assignments"("school_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_school_id_student_id_fkey" FOREIGN KEY ("school_id", "student_id") REFERENCES "students"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submission_files" ADD CONSTRAINT "submission_files_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submission_files" ADD CONSTRAINT "submission_files_school_id_submission_id_fkey" FOREIGN KEY ("school_id", "submission_id") REFERENCES "submissions"("school_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submission_files" ADD CONSTRAINT "submission_files_school_id_file_id_fkey" FOREIGN KEY ("school_id", "file_id") REFERENCES "stored_files"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "materials" ADD CONSTRAINT "materials_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "materials" ADD CONSTRAINT "materials_school_id_term_id_fkey" FOREIGN KEY ("school_id", "term_id") REFERENCES "terms"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "materials" ADD CONSTRAINT "materials_school_id_arm_id_fkey" FOREIGN KEY ("school_id", "arm_id") REFERENCES "class_arms"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "materials" ADD CONSTRAINT "materials_school_id_subject_id_fkey" FOREIGN KEY ("school_id", "subject_id") REFERENCES "subjects"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "materials" ADD CONSTRAINT "materials_school_id_teacher_staff_id_fkey" FOREIGN KEY ("school_id", "teacher_staff_id") REFERENCES "staff"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "materials" ADD CONSTRAINT "materials_school_id_file_id_fkey" FOREIGN KEY ("school_id", "file_id") REFERENCES "stored_files"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_views" ADD CONSTRAINT "material_views_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_views" ADD CONSTRAINT "material_views_school_id_material_id_fkey" FOREIGN KEY ("school_id", "material_id") REFERENCES "materials"("school_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_views" ADD CONSTRAINT "material_views_school_id_student_id_fkey" FOREIGN KEY ("school_id", "student_id") REFERENCES "students"("school_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_schedules" ADD CONSTRAINT "assessment_schedules_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_schedules" ADD CONSTRAINT "assessment_schedules_school_id_term_id_fkey" FOREIGN KEY ("school_id", "term_id") REFERENCES "terms"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_schedules" ADD CONSTRAINT "assessment_schedules_school_id_arm_id_fkey" FOREIGN KEY ("school_id", "arm_id") REFERENCES "class_arms"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_schedules" ADD CONSTRAINT "assessment_schedules_school_id_subject_id_fkey" FOREIGN KEY ("school_id", "subject_id") REFERENCES "subjects"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_schedules" ADD CONSTRAINT "assessment_schedules_school_id_component_id_fkey" FOREIGN KEY ("school_id", "component_id") REFERENCES "assessment_components"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_schedules" ADD CONSTRAINT "assessment_schedules_school_id_teaching_assignment_id_fkey" FOREIGN KEY ("school_id", "teaching_assignment_id") REFERENCES "teaching_assignments"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_notes" ADD CONSTRAINT "lesson_notes_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_notes" ADD CONSTRAINT "lesson_notes_school_id_term_id_fkey" FOREIGN KEY ("school_id", "term_id") REFERENCES "terms"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_notes" ADD CONSTRAINT "lesson_notes_school_id_teacher_staff_id_fkey" FOREIGN KEY ("school_id", "teacher_staff_id") REFERENCES "staff"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_notes" ADD CONSTRAINT "lesson_notes_school_id_subject_id_fkey" FOREIGN KEY ("school_id", "subject_id") REFERENCES "subjects"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_notes" ADD CONSTRAINT "lesson_notes_school_id_level_id_fkey" FOREIGN KEY ("school_id", "level_id") REFERENCES "class_levels"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_notes" ADD CONSTRAINT "lesson_notes_school_id_reviewer_staff_id_fkey" FOREIGN KEY ("school_id", "reviewer_staff_id") REFERENCES "staff"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_notes" ADD CONSTRAINT "lesson_notes_school_id_decided_by_staff_id_fkey" FOREIGN KEY ("school_id", "decided_by_staff_id") REFERENCES "staff"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_notes" ADD CONSTRAINT "lesson_notes_school_id_attachment_file_id_fkey" FOREIGN KEY ("school_id", "attachment_file_id") REFERENCES "stored_files"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------------------------
-- Integrity rules Prisma's schema language cannot express. Prisma Migrate ignores CHECK
-- constraints when diffing, so later migrations leave these alone. Keep this list in step with
-- docs/backend/data-model.md ("Integrity rules").
-- ---------------------------------------------------------------------------------------------

-- Tenancy and identity
ALTER TABLE "schools" ADD CONSTRAINT "schools_slug_format_chk"
  CHECK (slug ~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$');
ALTER TABLE "school_memberships" ADD CONSTRAINT "school_memberships_target_chk" CHECK (
  (kind = 'STAFF' AND guardian_id IS NULL AND student_id IS NULL)
  OR (kind = 'GUARDIAN' AND guardian_id IS NOT NULL AND staff_id IS NULL AND student_id IS NULL)
  OR (kind = 'STUDENT' AND student_id IS NOT NULL AND staff_id IS NULL AND guardian_id IS NULL)
);
ALTER TABLE "users" ADD CONSTRAINT "users_failed_sign_in_count_chk" CHECK (failed_sign_in_count >= 0);

-- Calendar
ALTER TABLE "academic_sessions" ADD CONSTRAINT "academic_sessions_dates_chk" CHECK (ends_on > starts_on);
ALTER TABLE "terms" ADD CONSTRAINT "terms_dates_chk" CHECK (ends_on > starts_on AND sequence >= 1);
ALTER TABLE "term_events" ADD CONSTRAINT "term_events_dates_chk" CHECK (ends_on >= starts_on);
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_dates_chk" CHECK (ends_on >= starts_on);
ALTER TABLE "class_arms" ADD CONSTRAINT "class_arms_capacity_chk" CHECK (capacity > 0);
ALTER TABLE "timetable_periods" ADD CONSTRAINT "timetable_periods_times_chk" CHECK (ends_at > starts_at);

-- Assessment and results
ALTER TABLE "assessment_components" ADD CONSTRAINT "assessment_components_values_chk"
  CHECK (max_score > 0 AND weight >= 0 AND weight <= 100);
ALTER TABLE "grade_bands" ADD CONSTRAINT "grade_bands_range_chk" CHECK (min_score <= max_score);
ALTER TABLE "assessment_schemes" ADD CONSTRAINT "assessment_schemes_pass_mark_chk"
  CHECK (pass_mark >= 0 AND pass_mark <= 100);
-- A number only when SCORED: ABS and EXM are states, and a missing score has no row.
ALTER TABLE "result_scores" ADD CONSTRAINT "result_scores_state_chk"
  CHECK ((state = 'SCORED') = (score IS NOT NULL) AND (score IS NULL OR score >= 0));
ALTER TABLE "result_entries" ADD CONSTRAINT "result_entries_total_chk"
  CHECK (total IS NULL OR (total >= 0 AND total <= 100));
ALTER TABLE "score_corrections" ADD CONSTRAINT "score_corrections_values_chk"
  CHECK (original_score >= 0 AND proposed_score >= 0 AND proposed_score <> original_score);
ALTER TABLE "conduct_ratings" ADD CONSTRAINT "conduct_ratings_rating_chk" CHECK (rating BETWEEN 1 AND 5);

-- Teaching
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_max_score_chk"
  CHECK (max_score IS NULL OR max_score BETWEEN 1 AND 100);
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_score_chk" CHECK (score IS NULL OR score >= 0);
ALTER TABLE "assignment_attachments" ADD CONSTRAINT "assignment_attachments_target_chk"
  CHECK (num_nonnulls(file_id, material_id) = 1);
ALTER TABLE "materials" ADD CONSTRAINT "materials_content_chk" CHECK (
  (type = 'VIDEO_LINK' AND link_url IS NOT NULL AND file_id IS NULL)
  OR (type <> 'VIDEO_LINK' AND file_id IS NOT NULL AND link_url IS NULL)
);
ALTER TABLE "lesson_notes" ADD CONSTRAINT "lesson_notes_week_chk" CHECK (week >= 1);

-- Money: amounts are kobo; never negative, and paid never exceeds the total.
ALTER TABLE "plans" ADD CONSTRAINT "plans_money_chk" CHECK (
  coalesce(annual_price_kobo, 0) >= 0 AND coalesce(term_price_kobo, 0) >= 0
  AND coalesce(month_price_kobo, 0) >= 0 AND coalesce(per_student_kobo, 0) >= 0
  AND coalesce(minimum_per_term_kobo, 0) >= 0 AND setup_fee_kobo >= 0
);
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_price_chk" CHECK (price_kobo >= 0);
ALTER TABLE "platform_invoices" ADD CONSTRAINT "platform_invoices_amount_chk" CHECK (amount_kobo >= 0);
ALTER TABLE "fee_structure_amounts" ADD CONSTRAINT "fee_structure_amounts_amount_chk" CHECK (amount_kobo >= 0);
ALTER TABLE "discounts" ADD CONSTRAINT "discounts_value_chk"
  CHECK (value >= 0 AND (kind <> 'PERCENTAGE' OR value <= 10000));
ALTER TABLE "payment_plan_installments" ADD CONSTRAINT "payment_plan_installments_share_chk"
  CHECK (share_bp BETWEEN 1 AND 10000 AND offset_days >= 0);
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_money_chk" CHECK (
  subtotal_kobo >= 0 AND discount_kobo >= 0 AND total_kobo >= 0
  AND paid_kobo >= 0 AND paid_kobo <= total_kobo
);
ALTER TABLE "invoice_discounts" ADD CONSTRAINT "invoice_discounts_amount_chk" CHECK (amount_kobo >= 0);
ALTER TABLE "invoice_installments" ADD CONSTRAINT "invoice_installments_amount_chk" CHECK (amount_kobo >= 0);
ALTER TABLE "payments" ADD CONSTRAINT "payments_amount_chk" CHECK (amount_kobo > 0);
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_amount_chk" CHECK (amount_kobo > 0);
ALTER TABLE "credit_applications" ADD CONSTRAINT "credit_applications_amount_chk" CHECK (amount_kobo > 0);
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_amount_chk" CHECK (amount_kobo > 0);
ALTER TABLE "account_transfers" ADD CONSTRAINT "account_transfers_chk"
  CHECK (amount_kobo > 0 AND from_account_id <> to_account_id);
ALTER TABLE "bank_statement_lines" ADD CONSTRAINT "bank_statement_lines_amounts_chk"
  CHECK (credit_kobo >= 0 AND debit_kobo >= 0);
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_amount_chk" CHECK (amount_kobo > 0);
ALTER TABLE "finance_settings" ADD CONSTRAINT "finance_settings_limits_chk"
  CHECK (late_fee_value >= 0 AND expense_limit_kobo >= 0 AND refund_limit_kobo >= 0);

-- Support
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_rating_chk"
  CHECK (rating_score IS NULL OR rating_score BETWEEN 1 AND 5);

-- Files
ALTER TABLE "stored_files" ADD CONSTRAINT "stored_files_size_chk" CHECK (size_bytes >= 0);
