import { count, eq, gte, lte, sql } from 'drizzle-orm'
import { db } from '../db'
import { goalCompletions, goals, users } from '../db/schema'
import { and } from 'drizzle-orm'
import dayjs from 'dayjs'

interface CreateGoalCompletionRequest {
  goalId: string
  userId: string
}

export async function createGoalCompletion({
  goalId,
  userId,
}: CreateGoalCompletionRequest) {
  const firstDayOfWeek = dayjs().startOf('week').toDate()
  const lastDayOfWeek = dayjs().endOf('week').toDate()

  const goalCompletionCounts = db.$with('goal_completion_counts').as(
    db
      .select({
        goalId: goalCompletions.goalId,
        completionCount: count(goalCompletions.id).as('completion_count'),
      })
      .from(goalCompletions)
      .innerJoin(goals, eq(goals.id, goalCompletions.goalId))
      .where(
        and(
          gte(goalCompletions.createdAt, firstDayOfWeek),
          lte(goalCompletions.createdAt, lastDayOfWeek),
          eq(goalCompletions.goalId, goalId),
          eq(goals.userId, userId)
        )
      )
      .groupBy(goalCompletions.goalId)
  )

  const result = await db
    .with(goalCompletionCounts)
    .select({
      desiredWeeklyFequency: goals.desiredWeeklyFrequency,
      completionCount: sql /*sql*/`
        COALESCE(${goalCompletionCounts.completionCount}, 0)
      `.mapWith(Number),
    })
    .from(goals)
    .leftJoin(goalCompletionCounts, eq(goalCompletionCounts.goalId, goals.id))
    .where(and(eq(goals.id, goalId), eq(goals.userId, userId)))
    .limit(1)

  const { completionCount, desiredWeeklyFequency } = result[0]

  if (completionCount >= desiredWeeklyFequency) {
    throw new Error('Goal already completed this week')
  }

  const isLastCompletionFromGoal = completionCount + 1 === desiredWeeklyFequency
  const earnedExperience = isLastCompletionFromGoal ? 7 : 5

  const goalCompletion = await db.transaction(async tx => {
    const [goalCompletion] = await db
      .insert(goalCompletions)
      .values({
        goalId,
      })
      .returning()

    await db
      .update(users)
      .set({ experience: sql`${users.experience} + ${earnedExperience}` })
      .where(eq(users.id, userId))

    return goalCompletion
  })

  return {
    goalCompletion,
  }
}
