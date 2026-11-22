import { BranchBrandingService } from './branch-branding.service.js';
import { SchoolWide } from '../../common/plan/branch-scope.js';
import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put } from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { Portals, RequirePermission } from '../../auth/decorators/auth.decorators.js';
import { CurrentTenant } from '../../common/decorators/request.decorators.js';
import { type MessageRequest, ResponseMessage } from '../../common/http/api-response.js';
import { RecordIdPipe } from '../../platform/shared/params.js';
import { BRANCH_NOT_FOUND, BranchesService } from './branches.service.js';
import {
  BranchBrandingDto,
  BranchDto,
  DeactivateBranchDto,
  ReactivateBranchDto,
} from './dto/branches.dto.js';
import {
  BranchDeletedResponse,
  BranchDetailResponse,
  BranchListResponse,
  BranchResponse,
} from './dto/branches.responses.js';

const branchId = new RecordIdPipe(BRANCH_NOT_FOUND);

@ApiTags('school · branches')
@Portals('SCHOOL_ADMIN')
@SchoolWide()
@Controller('branches')
export class BranchesController {
  constructor(
    private readonly branches: BranchesService,
    private readonly brandingSvc: BranchBrandingService,
  ) {}

  @ResponseMessage('Branches loaded.')
  @Get()
  @RequirePermission('settings.branches')
  @ApiOperation({ summary: 'Every branch, with the plan’s branch limit and the school’s sections' })
  @ApiOkResponse({ type: BranchListResponse })
  list(@CurrentTenant() schoolId: string) {
    return this.branches.list(schoolId);
  }

  @ResponseMessage('Branch created. Next, set up its classes.')
  @Post()
  @RequirePermission('settings.branches')
  @ApiOperation({
    summary: 'Add a branch',
    description:
      'Inactive branches count toward the plan’s limit. With `grantBranchAdmin`, a branch-scoped ' +
      'head of campus also gets Branch Admin access for the branch.',
  })
  @ApiCreatedResponse({ type: BranchResponse })
  @ApiConflictResponse({ description: 'BRANCH_LIMIT' })
  @ApiUnprocessableEntityResponse({
    description: 'VALIDATION, BRANCH_NAME_TAKEN, BRANCH_CODE_TAKEN',
  })
  create(@CurrentTenant() schoolId: string, @Body() dto: BranchDto) {
    return this.branches.create(schoolId, dto);
  }

  @ResponseMessage('Branch loaded.')
  @Get(':id')
  @RequirePermission('settings.branches')
  @ApiOperation({ summary: 'A branch with its classes, staff, branch-only users and history' })
  @ApiOkResponse({ type: BranchDetailResponse })
  @ApiNotFoundResponse({ description: 'NOT_FOUND / BRANCH_NOT_FOUND' })
  detail(@Param('id', branchId) id: string) {
    return this.branches.detail(id);
  }

  @ResponseMessage((b: BranchResponse, req: MessageRequest<BranchDto>) =>
    req.body?.grantBranchAdmin && b.headName
      ? `Branch saved. ${b.headName} now has Branch Admin access.`
      : 'Branch saved.',
  )
  @Patch(':id')
  @RequirePermission('settings.branches')
  @ApiOperation({ summary: 'Edit a branch (the whole form)' })
  @ApiOkResponse({ type: BranchResponse })
  @ApiNotFoundResponse({ description: 'NOT_FOUND / BRANCH_NOT_FOUND' })
  @ApiConflictResponse({ description: 'SECTION_HAS_CLASSES' })
  @ApiUnprocessableEntityResponse({
    description: 'VALIDATION, BRANCH_NAME_TAKEN, BRANCH_CODE_TAKEN',
  })
  update(
    @CurrentTenant() schoolId: string,
    @Param('id', branchId) id: string,
    @Body() dto: BranchDto,
  ) {
    return this.branches.update(schoolId, id, dto);
  }

  @ResponseMessage('Branding loaded.')
  @Get(':id/branding')
  @RequirePermission('settings.branches')
  @ApiOperation({ summary: 'The campus’s own logo and colour (null: the school’s)' })
  branding(@Param('id', branchId) id: string) {
    return this.brandingSvc.view(id);
  }

  @ResponseMessage((r: { name: string }) => `${r.name} branding saved.`)
  @Put(':id/branding')
  @RequirePermission('settings.branches')
  @ApiOperation({
    summary: 'Set the campus’s logo and colour, used on its report cards, receipts and screens',
  })
  setBranding(@Param('id', branchId) id: string, @Body() dto: BranchBrandingDto) {
    return this.brandingSvc.set(id, dto);
  }

  @ResponseMessage((b: BranchResponse) => `${b.name} deactivated.`)
  @Post(':id/deactivate')
  @HttpCode(200)
  @RequirePermission('settings.branches')
  @ApiOperation({
    summary: 'Deactivate a branch',
    description: 'Not the last active branch, and not while students are enrolled there.',
  })
  @ApiOkResponse({ type: BranchResponse })
  @ApiNotFoundResponse({ description: 'NOT_FOUND / BRANCH_NOT_FOUND' })
  @ApiConflictResponse({
    description: 'BRANCH_INACTIVE, LAST_ACTIVE_BRANCH, BRANCH_HAS_STUDENTS',
  })
  deactivate(@Param('id', branchId) id: string, @Body() dto: DeactivateBranchDto) {
    return this.branches.deactivate(id, dto.reason);
  }

  @ResponseMessage((b: BranchResponse) => `${b.name} is active again.`)
  @Post(':id/reactivate')
  @HttpCode(200)
  @RequirePermission('settings.branches')
  @ApiOperation({ summary: 'Reactivate a branch' })
  @ApiOkResponse({ type: BranchResponse })
  @ApiNotFoundResponse({ description: 'NOT_FOUND / BRANCH_NOT_FOUND' })
  reactivate(@Param('id', branchId) id: string, @Body() _dto: ReactivateBranchDto) {
    return this.branches.reactivate(id);
  }

  @ResponseMessage((r: BranchDeletedResponse) => `${r.name} deleted.`)
  @Delete(':id')
  @RequirePermission('settings.branches')
  @ApiOperation({
    summary: 'Delete a branch',
    description:
      'Only a branch added after setup with no students, staff, classes or other records. ' +
      'Deactivate the others.',
  })
  @ApiOkResponse({ type: BranchDeletedResponse })
  @ApiNotFoundResponse({ description: 'NOT_FOUND / BRANCH_NOT_FOUND' })
  @ApiConflictResponse({ description: 'BRANCH_NOT_DELETABLE' })
  remove(@CurrentTenant() schoolId: string, @Param('id', branchId) id: string) {
    return this.branches.remove(schoolId, id);
  }
}
