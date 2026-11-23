-- Parent messaging: conversations with teachers and the school office, and their messages.
-- CreateEnum
CREATE TYPE "conversation_kind" AS ENUM ('TEACHER', 'SCHOOL');

-- CreateEnum
CREATE TYPE "chat_sender" AS ENUM ('PARENT', 'TEACHER', 'SCHOOL');

-- CreateTable
CREATE TABLE "conversations" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "kind" "conversation_kind" NOT NULL,
    "guardian_id" UUID NOT NULL,
    "staff_id" UUID,
    "student_id" UUID,
    "subject" TEXT NOT NULL,
    "last_message_at" TIMESTAMPTZ(3) NOT NULL,
    "parent_read_at" TIMESTAMPTZ(3),
    "staff_read_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_messages" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "sender" "chat_sender" NOT NULL,
    "sender_user_id" UUID,
    "sender_name" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "conversations_school_id_guardian_id_last_message_at_idx" ON "conversations"("school_id", "guardian_id", "last_message_at");

-- CreateIndex
CREATE INDEX "conversations_school_id_staff_id_last_message_at_idx" ON "conversations"("school_id", "staff_id", "last_message_at");

-- CreateIndex
CREATE INDEX "conversations_school_id_kind_last_message_at_idx" ON "conversations"("school_id", "kind", "last_message_at");

-- CreateIndex
CREATE UNIQUE INDEX "conversations_school_id_id_key" ON "conversations"("school_id", "id");

-- CreateIndex
CREATE INDEX "chat_messages_school_id_conversation_id_created_at_idx" ON "chat_messages"("school_id", "conversation_id", "created_at");

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_school_id_guardian_id_fkey" FOREIGN KEY ("school_id", "guardian_id") REFERENCES "guardians"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_school_id_staff_id_fkey" FOREIGN KEY ("school_id", "staff_id") REFERENCES "staff"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_school_id_student_id_fkey" FOREIGN KEY ("school_id", "student_id") REFERENCES "students"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_school_id_conversation_id_fkey" FOREIGN KEY ("school_id", "conversation_id") REFERENCES "conversations"("school_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

