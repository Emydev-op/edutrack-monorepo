<script setup lang="ts">
import { Button } from '@edutrack/ui/components/button';
import { Skeleton } from '@edutrack/ui/components/skeleton';
import { computed } from 'vue';
import { RouterLink } from 'vue-router';

import ActivityTimeline from '@edutrack/app-kit/components/common/ActivityTimeline.vue';
import InlineNotice from '@edutrack/app-kit/components/common/InlineNotice.vue';
import KeyValueCard, {
  type KeyValueRow,
} from '@edutrack/app-kit/components/common/KeyValueCard.vue';
import PageHeader from '@edutrack/app-kit/components/common/PageHeader.vue';
import { formatCount, initials } from '@edutrack/app-kit/lib/format';

import { useBranchesQuery, useSchoolProfileQuery } from '@/api/services/school';
import { routesPath } from '@/router/routes-path';

import { paletteName } from './brand';

const { data: profile, isPending, isError, refetch } = useSchoolProfileQuery();
const { data: branches } = useBranchesQuery();

const edit = (step: number) => ({ name: routesPath.school.profileEdit.name, query: { step } });

const cards = computed(() => {
  const p = profile.value;
  if (!p) return [];
  const list = branches.value?.branches ?? [];
  const active = list.filter((b) => b.status === 'Active').length;
  const rows = (r: [string, string | undefined, KeyValueRow['emphasis']?][]): KeyValueRow[] =>
    r.map(([label, value, emphasis]) => ({ label, value, emphasis }));
  return [
    {
      title: 'Identity',
      to: edit(0),
      rows: rows([
        ['Display name', p.name],
        ['Legal name', p.legalName],
        ['Motto', p.motto],
        ['Ownership', p.ownership],
        ['Founded', p.founded],
        ['Logo', p.logo ? p.logo.name : 'Initials used · no logo uploaded'],
      ]),
    },
    {
      title: 'Contact',
      to: edit(1),
      rows: rows([
        ['Email', p.email],
        ['Phone', p.phone],
        ['Website', p.website],
      ]),
    },
    {
      title: 'Head office address',
      to: edit(1),
      rows: rows([
        ['Address', p.street],
        ['Town / city', p.city],
        ['LGA', p.lga],
        ['State', p.state],
        ['Country', 'Nigeria · Africa/Lagos'],
      ]),
    },
    {
      title: 'Registration',
      to: edit(2),
      rows: rows([
        ['Approving body', p.approvingBody],
        ['Approval number', p.approvalNumber],
        ['CAC number', p.cacNumber],
        [
          'Certificate',
          p.certificate ? `${p.certificate.name} · verified` : 'Not uploaded',
          p.certificate ? 'success' : 'error',
        ],
      ]),
    },
    {
      title: 'Academic offering',
      to: { name: routesPath.school.branches.name },
      link: 'Branches',
      rows: rows([
        ['Sections', p.sections.join(', ')],
        [
          'Branches',
          branches.value
            ? `${list.length} (${active} active) · ${list.length} of ${p.plan.branchLimit} on your plan`
            : undefined,
        ],
      ]),
    },
    {
      title: 'Subscription',
      to: { name: routesPath.settings.name },
      link: 'Manage',
      rows: rows([
        ['Plan', p.plan.name],
        ['Students', `${formatCount(p.plan.students)} of ${formatCount(p.plan.studentLimit)}`],
        ['Renews', p.plan.renews],
      ]),
    },
    {
      title: 'Branding',
      rows: rows([
        ['Brand color', `${paletteName(p.brandColor)} · ${p.brandColor.toUpperCase()}`],
        ['Set by', 'Edutrack · request changes from support'],
      ]),
    },
  ];
});
</script>

<template>
  <template v-if="isPending">
    <Skeleton class="h-16 w-1/2" />
    <div class="grid gap-4 md:grid-cols-2"><Skeleton v-for="i in 4" :key="i" class="h-44" /></div>
  </template>

  <InlineNotice
    v-else-if="isError || !profile"
    tone="error"
    title="We couldn’t load the school profile"
    description="Nothing has changed. Try again in a moment."
    role="alert"
  >
    <template #action
      ><Button variant="outline" size="sm" @click="refetch()">Try again</Button></template
    >
  </InlineNotice>

  <template v-else>
    <PageHeader
      :title="profile.name"
      :initials="initials(profile.name)"
      status="Active"
      :description="`School-wide information. Applies to every branch. Last updated ${profile.updatedAt}.`"
    >
      <template #actions>
        <Button as-child variant="outline"
          ><RouterLink :to="{ name: routesPath.school.branches.name }"
            >Manage branches</RouterLink
          ></Button
        >
        <Button as-child
          ><RouterLink :to="{ name: routesPath.school.profileEdit.name }"
            >Edit profile</RouterLink
          ></Button
        >
      </template>
    </PageHeader>

    <InlineNotice
      tone="info"
      title="School-wide vs branch details"
      description="Each campus has its own address, contact, head of campus and sections. Legal and registration details belong to the school."
    >
      <template #action>
        <Button as-child variant="outline" size="sm"
          ><RouterLink :to="{ name: routesPath.school.branches.name }"
            >Manage branches</RouterLink
          ></Button
        >
      </template>
    </InlineNotice>
    <InlineNotice
      v-if="!profile.certificate"
      tone="warning"
      title="Approval certificate missing"
      description="Upload your approval certificate so Edutrack can verify the school."
    >
      <template #action>
        <Button as-child variant="outline" size="sm"
          ><RouterLink :to="edit(2)">Upload certificate</RouterLink></Button
        >
      </template>
    </InlineNotice>

    <div class="grid items-start gap-4 md:grid-cols-2">
      <KeyValueCard v-for="c in cards" :key="c.title" :title="c.title" :rows="c.rows">
        <template v-if="c.to" #action>
          <RouterLink :to="c.to" class="text-[13px] font-medium text-primary hover:underline">{{
            c.link ?? 'Edit'
          }}</RouterLink>
        </template>
      </KeyValueCard>
    </div>

    <ActivityTimeline title="Profile history" :items="profile.history" />
  </template>
</template>
