from roadmap.domain.models import ActivitySnapshot, ProficiencyStatus, ThresholdPolicy


class TechnologyStatusPolicy:
    def resolve(self, activity: ActivitySnapshot, thresholds: ThresholdPolicy) -> ProficiencyStatus:
        if (
            activity.coding_hours >= thresholds.expert_coding_hours
            and activity.writing_count >= thresholds.expert_writings
            and activity.open_source_contributions >= thresholds.expert_contributions
        ):
            return ProficiencyStatus.EXPERT

        if activity.coding_hours >= thresholds.proficient_coding_hours:
            return ProficiencyStatus.PROFICIENT

        if activity.reading_hours >= thresholds.exploration_hours:
            return ProficiencyStatus.EXPLORING

        return ProficiencyStatus.EXPLORING

