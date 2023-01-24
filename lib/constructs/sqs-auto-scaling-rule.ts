import { Construct } from "constructs";
import { CfnOutput } from "aws-cdk-lib";
import { aws_iam as iam } from 'aws-cdk-lib';
import { aws_sqs as sqs } from 'aws-cdk-lib';
import { aws_autoscaling as autoscaling } from 'aws-cdk-lib';
import { custom_resources as custom_resource } from 'aws-cdk-lib';

export interface sqsAutoScalingRuleProps {
  queue: sqs.Queue,
  autoScalingGroup: autoscaling.AutoScalingGroup,
}

export default class sqsAutoScalingRule extends Construct {
  public readonly ec2Role: iam.Role;
  public autoScalingGroup: autoscaling.AutoScalingGroup;

  constructor(scope: Construct, id: string, props: sqsAutoScalingRuleProps) {
    super(scope, id);

    const { 
      queue,
      autoScalingGroup,
    } = props;


    // This isn't working for some reason. Probably SDK version differences...
    const sqsTargetTrackingScalingPolicy = new custom_resource.AwsCustomResource(this, 'SQSTargetTrackingScalingPolicyCR', {
      onUpdate: {
        service: 'AutoScaling',
        action: 'putScalingPolicy',
        physicalResourceId: custom_resource.PhysicalResourceId.of(Date.now().toString()),
        parameters: {
          AutoScalingGroupName: autoScalingGroup.autoScalingGroupName,
          PolicyName: 'sqs-target-tracking-scaling-policy-v1',
          PolicyType: 'TargetTrackingScaling',
          TargetTrackingConfiguration: {
            "CustomizedMetricSpecification": {
              "Metrics": [
                {
                  "Label": "Get the queue size (the number of messages waiting to be processed)",
                  "Id": "m1",
                  "MetricStat": {
                    "Metric": {
                      "MetricName": "ApproximateNumberOfMessagesVisible",
                      "Namespace": "AWS/SQS",
                      "Dimensions": [
                        {
                          "Name": "QueueName",
                          "Value": queue.queueName,
                        }
                      ]
                    },
                    "Stat": "Sum"
                  },
                  "ReturnData": false
                },
                {
                  "Label": "Get the group size (the number of InService instances)",
                  "Id": "m2",
                  "MetricStat": {
                    "Metric": {
                      "MetricName": "GroupInServiceInstances",
                      "Namespace": "AWS/AutoScaling",
                      "Dimensions": [
                        {
                          "Name": "AutoScalingGroupName",
                          "Value": autoScalingGroup.autoScalingGroupName,
                        }
                      ]
                    },
                    "Stat": "Average"
                  },
                  "ReturnData": false
                },
                {
                  "Label": "Calculate the backlog per instance",
                  "Id": "e1",
                  "Expression": "m1 / m2",
                  "ReturnData": true
                }
              ]
            },
            "TargetValue": 1
          }
        }
      },
      onDelete: {
        service: 'AutoScaling',
        action: 'deletePolicy',
        parameters: {
          AutoScalingGroupName: autoScalingGroup.autoScalingGroupName,
          PolicyName: 'sqs-target-tracking-scaling-policy-v1',
        }
      },
      policy: custom_resource.AwsCustomResourcePolicy.fromSdkCalls({
        resources: custom_resource.AwsCustomResourcePolicy.ANY_RESOURCE,
      }),
    });

    


    // CFN doesn't support this yet.
    // const sqsMetric = new cloudwatch.Metric({
    //   namespace: 'AWS/SQS',
    //   metricName: 'ApproximateNumberOfMessagesVisible',
    //   dimensionsMap: {
    //     Name: "QueueName",
    //     Value: queue.queueName,
    //   },
    //   statistic: "avg",
    //   period: Duration.minutes(1),
    // });
    // const asgMetric = new cloudwatch.Metric({
    //   namespace: 'AWS/AutoScaling',
    //   metricName: 'GroupInServiceInstances',
    //   dimensionsMap: {
    //     Name: "AutoScalingGroupName",
    //     Value: autoScalingGroup.autoScalingGroupName,
    //   },
    //   statistic: "avg",
    //   period: Duration.minutes(1)
    // });
    // // Need to do a custom resource...
    // // CFN doesn't support MathExpressions for TargetTrackingPolicies yet.
    // const computedMetric = new cloudwatch.MathExpression({
    //   expression: "messages / instances",
    //   usingMetrics: {
    //     messages: sqsMetric,
    //     instances: asgMetric,
    //   },
    //   period: Duration.minutes(1),
    // });

    // const sqsTargetTrackingScalingPolicy = new autoscaling.TargetTrackingScalingPolicy(this, 'SQSTargetTrackingScalingPolicy', {
    //   autoScalingGroup: autoScalingGroup,
    //   targetValue: 2,
    //   customMetric: computedMetric,
    // });





  }
}